import { getActiveJob } from '@/services/modules/deploy-service'
import { useDeployTaskStore, type DeployPhase } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'

/**
 * 应用级构建 / 部署实时链路。
 *
 * 取代旧 `app.js:setupWSHandlers` 里 `log` / `progress` / `status` 三个处理器与
 * `checkActiveJob`。本地运行的 `run-status` / `run-log` 由 `run-runtime-service`
 * 与 `useRunRealtime` 负责，两者共用同一条旧全局 WS 连接，不另起连接。
 *
 * 为什么必须常驻（挂在 `MigrationHost`）而不是留在 `useDeployRealtime` 里：
 *
 * 1. 构建/部署从**项目总览**的卡片发起，而弹窗仍在 legacy 侧——任务可以在任何
 *    页面上发起并在任何页面上完成，链路不能依赖某个子页被访问过。
 * 2. `checkActiveJob` 要在启动与 WS 重连时恢复任务，那两个时刻通常还没有任何
 *    deploy 子页挂载过。
 * 3. 与 legacy 处理器并存会**双写**同一个 log store（每行日志追加两次），
 *    所以 `app.js` 侧那三个处理器随本服务上线一并退役。
 */

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

/** 构建只有 2 步，部署 5 步。恢复任务与发起任务共用这两套。 */
const BUILD_STEPS = ['拉取代码', '构建中']
const DEPLOY_STEPS = ['预检', '拉取代码', '构建中', '上传中', '完成']

/** 超过这个时长的活跃任务不再恢复，与 legacy `checkActiveJob` 的判据一致。 */
const RESUME_MAX_AGE = 5 * 60 * 1000

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
export function stepIndexOf(phase: DeployPhase, stepCount: number): number | null {
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

export interface DeployFinishedDetail {
  projectName: string
  success: boolean
  type: string
}

type FinishedListener = (detail: DeployFinishedDetail) => void

/**
 * 完成回调的订阅表。
 *
 * 子页（项目总览）用它在任务结束后刷新「最近部署」摘要。放在模块级而非服务实例
 * 上：子页挂载时机与服务启动无关，服务先起、子页后订阅是常态。
 */
const finishedListeners = new Set<FinishedListener>()

export function onDeployFinished(listener: FinishedListener): () => void {
  finishedListeners.add(listener)
  return () => { finishedListeners.delete(listener) }
}

/** 仅供测试：清空订阅表，避免用例间互相看见对方的回调。 */
export function resetDeployFinishedListenersForTest() {
  finishedListeners.clear()
}

export function createDeployRealtimeService() {
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

    /*
      桌面通知仍走 legacy 的 `sendDesktopNotification`：它带权限申请、Tauri/Web
      双通道与「点通知回到日志」的待办记账，整套尚未迁入 Vue（与
      `todo-reminder-service` 同一处理方式）。
    */
    const typeText = isBuildOnly ? '构建' : '部署'
    window.sendDesktopNotification?.(
      `${typeText}${success ? '成功' : '失败'}`,
      success ? `${projectName} ${typeText}完成，耗时 ${duration}` : `${projectName} ${typeText}失败`,
      success,
      { target: 'log' },
    )

    task.finish(projectName || undefined)
    for (const listener of finishedListeners) {
      listener({ projectName, success, type: taskType })
    }
  }

  /**
   * 刷新 / 重连后恢复仍在跑的任务。
   *
   * 不恢复的后果不只是弹窗不见：`task.active` 为空会让 `acceptsMessage` 拒收
   * 该任务后续全部 WS 消息，卡片忙态也不会亮，直到用户再次刷新。
   */
  async function resumeActiveJob() {
    // 已在跟踪一个跑着的任务（且 id 已回填）就不打断它
    if (task.hasActiveTask && task.isRunning && task.taskId) return
    try {
      const job = await getActiveJob()
      if (!job) return
      if (Date.now() - job.startTime > RESUME_MAX_AGE) return

      /*
        后端 `activeJobs` 的 type 是 `'build' | 'deploy'`，与历史记录的
        `'build-only'` 不同名。legacy `checkActiveJob` 这里比的是 `'build-only'`，
        恒为 false，导致构建任务套上部署的 5 步 phaseMap 并越界推进——本次一并修正。
      */
      const isBuildOnly = job.type === 'build'
      const typeLabel = isBuildOnly ? '构建' : '部署'
      const steps = isBuildOnly ? BUILD_STEPS : DEPLOY_STEPS

      task.begin(job.projectName)
      task.attachTaskId(job.id)
      log.open({
        kind: 'deploy',
        id: job.id,
        projectName: job.projectName,
        title: `${typeLabel}进度`,
        subtitle: `${job.projectName} · ${job.modules.join(', ')}`,
      }, { steps })
      log.setProgress({ percent: 0, label: '0%' })

      const index = stepIndexOf(job.phase as DeployPhase, steps.length)
      log.activateStep(index ?? 0)

      if (job.logs.length > 0) {
        log.replaceLines(job.logs.map(line => ({ text: line.text, type: line.type as never })))
      }

      const elapsed = Math.round((Date.now() - job.startTime) / 1000)
      window.showToast?.(`🔄 恢复${typeLabel}任务`, `${job.projectName} 已运行 ${elapsed}s`, { clickable: true })
    } catch (cause) {
      console.warn('[deploy-realtime] 恢复活跃任务失败', cause)
    }
  }

  /** WS 重连后重新对账：断线期间的推送已丢失，需拉真实任务态纠正。 */
  const handleOpen = () => { void resumeActiveJob() }

  let started = false

  function start() {
    if (started) return
    started = true
    const ws = legacyWs()
    ws?.on('log', handleLog)
    ws?.on('progress', handleProgress)
    ws?.on('status', handleStatus)
    ws?.on('open', handleOpen)
    // 启动即恢复一次：用户刷新时任务可能还在跑，不能等 WS 重连事件
    void resumeActiveJob()
  }

  function stop() {
    if (!started) return
    started = false
    const ws = legacyWs()
    ws?.off('log', handleLog)
    ws?.off('progress', handleProgress)
    ws?.off('status', handleStatus)
    ws?.off('open', handleOpen)
  }

  return { start, stop, resumeActiveJob }
}
