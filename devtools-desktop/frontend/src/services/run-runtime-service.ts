import { showAppToast } from '@/services/app-toast'
import { sendDesktopNotification } from '@/services/desktop-notification'
import type { RunJob } from '@/services/modules/run-service'
import { realtimeWs } from '@/services/realtime'
import { useRunStore } from '@/stores/run'

/**
 * 应用级运行态对账服务。
 *
 * 取代旧 `app.js` 的 `loadRunStatuses` + `runningProjects` + `syncTrayMenu` 兜底链，
 * 以及 P9-3 迁入的 run 桌面通知 / 编译报错提醒（原 `setupWSHandlers` 的 run-status 分支）。
 *
 * 为什么不能只靠 RunView：`run store` 的 `reconcile` 原先只在 RunView 挂载后由
 * `useRunPage` / `useRunRealtime` 触发。而托盘菜单在**启动即可见**，用户不进本地
 * 运行页时托盘就会是空的；WS 断线重连后也不会自我纠正。因此对账必须挂在随应用
 * 常驻的位置，与页面挂载解耦。
 *
 * 与 RunView 内的对账并存是安全的：`reconcile` 幂等，且失败时保留现有状态。
 */

const RUN_COMPILE_ERROR_NOTIFY_DELAY = 15_000

function modulesText(job: Pick<RunJob, 'moduleNames'>) {
  return job.moduleNames.length ? ` · ${job.moduleNames.join(', ')}` : ''
}

export function createRunRuntimeService() {
  const store = useRunStore()
  const notifiedRunIds = new Set<string>()
  const notifiedRunCompileErrors = new Set<string>()
  const pendingRunCompileErrorTimers: Record<string, ReturnType<typeof setTimeout>> = {}

  function clearRunCompileErrorTimers(jobId: string) {
    Object.keys(pendingRunCompileErrorTimers)
      .filter((key) => key.startsWith(`${jobId}:`))
      .forEach((key) => {
        clearTimeout(pendingRunCompileErrorTimers[key])
        delete pendingRunCompileErrorTimers[key]
      })
  }

  function clearNotifiedCompileErrors(jobId: string) {
    [...notifiedRunCompileErrors].forEach((key) => {
      if (key.startsWith(`${jobId}:`)) notifiedRunCompileErrors.delete(key)
    })
  }

  function handleRunCompileErrorNotification(job: RunJob) {
    if (!job.id) return
    if (job.compileStatus !== 'error') {
      clearRunCompileErrorTimers(job.id)
      return
    }
    if (!job.compileErrorSeq) return

    const errorKey = `${job.id}:${job.compileErrorSeq}`
    if (notifiedRunCompileErrors.has(errorKey) || pendingRunCompileErrorTimers[errorKey]) return

    pendingRunCompileErrorTimers[errorKey] = setTimeout(() => {
      delete pendingRunCompileErrorTimers[errorKey]
      const latest = store.jobOf(job.projectName)
      if (
        !latest
        || latest.id !== job.id
        || latest.compileStatus !== 'error'
        || latest.compileErrorSeq !== job.compileErrorSeq
      ) return

      notifiedRunCompileErrors.add(errorKey)
      void sendDesktopNotification(
        '本地项目编译报错',
        `${latest.projectName}${modulesText(latest)}\n${latest.compileError || '请查看运行日志'}`,
        false,
        { target: 'log' },
      )
      showAppToast('本地项目编译报错', latest.projectName, { clickable: true })
    }, RUN_COMPILE_ERROR_NOTIFY_DELAY)
  }

  function handleRunNotifications(job: RunJob, active: boolean) {
    if (job.status === 'running' && !notifiedRunIds.has(job.id)) {
      notifiedRunIds.add(job.id)
      const urlText = job.url ? `\n${job.url}` : ''
      void sendDesktopNotification(
        '本地运行成功',
        `${job.projectName}${modulesText(job)} 已启动${urlText}`,
        true,
        { target: 'log' },
      )
    }

    handleRunCompileErrorNotification(job)

    if (!active && job.id) {
      notifiedRunIds.delete(job.id)
      clearRunCompileErrorTimers(job.id)
      clearNotifiedCompileErrors(job.id)
    }
  }

  /** WS 重连后全量对账：断线期间的 run-status 推送会丢失，重连后需拉真实状态纠正。 */
  const handleOpen = () => { void store.reconcile() }

  /**
   * 应用级 `run-status` 消费。
   *
   * RunView 挂载时也会处理同一事件，但 `applyJob` 是按 projectName 覆盖写入的
   * 幂等操作，重复应用不会产生偏差；这里保证的是**未打开本地运行页时**托盘依然
   * 跟得上服务起停，并负责桌面通知（仅此一处，避免与页面双重提醒）。
   */
  const handleStatus = (payload: unknown) => {
    const { job, active } = store.applyJob(payload)
    handleRunNotifications(job, active)
  }

  let started = false

  function start() {
    if (started) return
    started = true
    // 启动即对账一次，让托盘在用户尚未进入任何页面时就正确
    void store.reconcile()
    const ws = realtimeWs()
    ws?.on('open', handleOpen)
    ws?.on('run-status', handleStatus)
  }

  function stop() {
    if (!started) return
    started = false
    Object.keys(pendingRunCompileErrorTimers).forEach((key) => {
      clearTimeout(pendingRunCompileErrorTimers[key])
      delete pendingRunCompileErrorTimers[key]
    })
    notifiedRunIds.clear()
    notifiedRunCompileErrors.clear()
    const ws = realtimeWs()
    ws?.off('open', handleOpen)
    ws?.off('run-status', handleStatus)
  }

  return { start, stop }
}
