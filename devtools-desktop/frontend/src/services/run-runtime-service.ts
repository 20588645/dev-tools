import { useRunStore } from '@/stores/run'

/**
 * 应用级运行态对账服务。
 *
 * 取代旧 `app.js` 的 `loadRunStatuses` + `runningProjects` + `syncTrayMenu` 兜底链。
 *
 * 为什么不能只靠 RunView：`run store` 的 `reconcile` 原先只在 RunView 挂载后由
 * `useRunPage` / `useRunRealtime` 触发。而托盘菜单在**启动即可见**，用户不进本地
 * 运行页时托盘就会是空的；WS 断线重连后也不会自我纠正。因此对账必须挂在随应用
 * 常驻的位置（`MigrationHost`），与页面挂载解耦。
 *
 * 与 RunView 内的对账并存是安全的：`reconcile` 幂等，且失败时保留现有状态。
 */

interface LegacyWebSocket {
  on(type: string, handler: (payload: unknown) => void): void
  off(type: string, handler: (payload: unknown) => void): void
}

function legacyWs(): LegacyWebSocket | null {
  const candidate = (globalThis as { WS?: LegacyWebSocket }).WS
  return candidate && typeof candidate.on === 'function' ? candidate : null
}

declare global {
  interface Window {
    /**
     * 迁移期只读桥：`app.js` 的编译报错通知在延时回调里要校验「这条报错是否仍是
     * 该项目当前任务的最新一条」，原先读旧全局 `runningProjects`。全局删除后改由
     * 本桥回答。等桌面通知逻辑迁入 Vue 后一并删除。
     */
    __runActiveJob?: (projectName: string) => Record<string, unknown> | null
  }
}

export function createRunRuntimeService() {
  const store = useRunStore()
  /** WS 重连后全量对账：断线期间的 run-status 推送会丢失，重连后需拉真实状态纠正。 */
  const handleOpen = () => { void store.reconcile() }
  /**
   * 应用级 `run-status` 消费。
   *
   * RunView 挂载时也会处理同一事件，但 `applyJob` 是按 projectName 覆盖写入的
   * 幂等操作，重复应用不会产生偏差；这里保证的是**未打开本地运行页时**托盘依然
   * 跟得上服务起停。
   */
  const handleStatus = (payload: unknown) => { store.applyJob(payload) }

  let started = false

  function start() {
    if (started) return
    started = true
    window.__runActiveJob = (projectName: string) => store.jobOf(projectName) as Record<string, unknown> | null
    // 启动即对账一次，让托盘在用户尚未进入任何页面时就正确
    void store.reconcile()
    const ws = legacyWs()
    ws?.on('open', handleOpen)
    ws?.on('run-status', handleStatus)
  }

  function stop() {
    if (!started) return
    started = false
    delete window.__runActiveJob
    const ws = legacyWs()
    ws?.off('open', handleOpen)
    ws?.off('run-status', handleStatus)
  }

  return { start, stop }
}
