import { onBeforeUnmount, onMounted } from 'vue'

import { useDeployTaskStore, type DeployPhase } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'

/**
 * 构建 / 部署的实时链路。
 *
 * 取代旧 `app.js:setupWSHandlers` 里 `log` / `progress` / `status` 三个处理器
 * 中与部署相关的部分。本地运行的 `run-status` / `run-log` 由 `useRunRealtime`
 * 负责，两者共用同一条旧全局 WS 连接，不另起连接。
 */

/** 旧全局 WS（`src/js/websocket.js`）。Vue 侧不另起连接，避免两份状态各自维护。 */
interface LegacyWebSocket {
  on(type: string, handler: (payload: unknown) => void): void
  off(type: string, handler: (payload: unknown) => void): void
}

function legacyWs(): LegacyWebSocket | null {
  const candidate = (globalThis as { WS?: LegacyWebSocket }).WS
  return candidate && typeof candidate.on === 'function' ? candidate : null
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * phase → 应激活的步骤索引。
 *
 * 旧实现用 `setStepActive` / `setStepDone` 两个函数配合 `stepCount <= 2` 与
 * `> 3` 的分支表达，而 `setStepDone(i)` 本身等价于 `activateStep(i + 1)`，
 * 因此这里直接归一成「目标索引」。两种步骤集：
 *
 * - 构建 2 步：拉取代码、构建中
 * - 部署 5 步：预检、拉取代码、构建中、上传中、完成
 *
 * 映射关系与旧实现逐一对齐，改动它会让进度条与实际阶段错位。
 */
function stepIndexOf(phase: DeployPhase, stepCount: number): number | null {
  const compact = stepCount <= 2
  switch (phase) {
    case 'preflight':
      return 0
    case 'pulling':
      return compact ? 0 : 1
    case 'building':
      return compact ? 1 : 2
    case 'uploading':
      return stepCount > 3 ? 3 : null
    default:
      return null
  }
}

export interface DeployRealtimeOptions {
  /** 任务完成（成功或失败）后回调，供页面刷新项目列表等副作用。 */
  onFinished?: (detail: { projectName: string, success: boolean, type: string }) => void
}

type FinishedListener = NonNullable<DeployRealtimeOptions['onFinished']>

/**
 * WS 处理器只注册一次，与调用方数量无关。
 *
 * 两个原因：① 部署面板的多个子页都要用这条链路，逐个注册会让同一条日志被
 * 追加多次（旧 `WS.on` 不去重）；② 弹窗最小化后任务在后台完成仍需弹回并提示，
 * 因此注册后不再摘除——KeepAlive 下子页 deactivate 不触发 unmount，
 * 这与迁移前 `app.js:setupWSHandlers` 全程常驻的语义一致。
 */
let installed = false
const finishedListeners = new Set<FinishedListener>()

/**
 * 仅供测试重置模块级订阅状态。
 *
 * 运行时不需要——处理器一旦装上就该常驻；但测试里每个用例都换一个假 WS，
 * 不重置会让后续用例跳过注册，从而静默失去覆盖。
 */
export function resetDeployRealtimeForTest() {
  installed = false
  finishedListeners.clear()
}

export function useDeployRealtime(options: DeployRealtimeOptions = {}) {
  const task = useDeployTaskStore()
  const log = useLogTaskStore()
  const notify = useNotificationStore()

  const handleLog = (payload: unknown) => {
    const row = asRecord(payload)
    const id = text(row.id) || null
    if (!task.acceptsMessage(id)) return
    task.adoptTaskId(id)
    log.append(text(row.text), row.type as never)
  }

  const handleProgress = (payload: unknown) => {
    const row = asRecord(payload)
    const id = text(row.id) || null
    if (!task.acceptsMessage(id)) return
    task.adoptTaskId(id)
    const percent = typeof row.percent === 'number' ? row.percent : 0
    log.setProgress({ percent, label: `${percent}%` })
  }

  const handleStatus = (payload: unknown) => {
    const row = asRecord(payload)
    const id = text(row.id) || null
    if (!task.acceptsMessage(id)) return
    task.adoptTaskId(id)

    const phase = text(row.phase) as DeployPhase
    const success = row.status === 'success'

    /*
      连接测试（`test-` 前缀）复用同一条链路，但只有 preflight/done 两档，
      且完成文案与构建/部署不同，故单独分支。
    */
    if (id?.startsWith('test-') && phase === 'done') {
      const duration = typeof row.duration === 'number' ? row.duration : 0
      log.finishAllSteps()
      log.setProgress({ percent: 100, indeterminate: false, label: '', tone: success ? 'success' : 'danger' })
      log.setResult({
        icon: success ? '✅' : '❌',
        text: success ? `连接测试通过 ${duration}ms` : `连接失败: ${text(row.error) || '未知错误'}`,
      })
      log.setRunning(false)
      task.finish()
      return
    }

    if (phase !== 'done') {
      const index = stepIndexOf(phase, log.steps.length)
      if (index !== null) log.activateStep(index)
      return
    }

    const projectName = text(row.projectName)
    const taskType = text(row.type)
    const isBuildOnly = taskType === 'build-only'
    const duration = text(row.duration)

    log.finishAllSteps()
    log.setProgress({ percent: 100, indeterminate: false, label: '100%', tone: success ? 'success' : 'danger' })
    log.setResult(success
      ? { icon: '✅', text: `${isBuildOnly ? '构建' : '部署'}完成！耗时 ${duration}` }
      : { icon: '❌', text: isBuildOnly ? '构建失败' : '部署失败' })
    log.setRunning(false)

    // 任务在后台完成（弹窗已最小化）时重新弹出并提示，否则用户不会知道结果
    if (!log.visible) {
      log.reopen()
      notify.push(`${success ? '任务完成' : '任务失败'}：${projectName}`, success ? 'success' : 'error')
    }

    task.finish(projectName || undefined)
    for (const listener of finishedListeners) {
      listener({ projectName, success, type: taskType })
    }
  }

  onMounted(() => {
    if (options.onFinished) finishedListeners.add(options.onFinished)
    if (installed) return
    const ws = legacyWs()
    if (!ws) return
    ws.on('log', handleLog)
    ws.on('progress', handleProgress)
    ws.on('status', handleStatus)
    installed = true
  })

  onBeforeUnmount(() => {
    // 只摘自己的完成回调；WS 处理器常驻，见上方说明
    if (options.onFinished) finishedListeners.delete(options.onFinished)
  })

  return { stepIndexOf }
}
