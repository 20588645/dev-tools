import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useInterval } from '@/composables/use-interval'
import { usePageVisibility } from '@/composables/use-page-visibility'
import { useRunStore } from '@/stores/run'

/**
 * 本地运行的实时链路：三道兜底缺一不可（见 assessment 3.1）。
 *
 * 1. WS `run-status` 主推送 —— 状态变化时即时更新。
 * 2. WS `open` 重连全量对账 —— 断线期间的推送会全部丢失，重连后必须补一次。
 * 3. 15 秒轮询 —— 双职责：
 *    ① 刷新「运行时长」文本。WS 只在状态变化时推送，稳定运行的服务不会触发重渲，
 *       时长会停在旧值；
 *    ② 与后端对账。WS 丢事件或瞬断时内存运行态可能失真。
 *
 * 轮询**仅在有运行中项目时**才请求后端，空闲不打扰；页面不可见时也不请求。
 * 这三条不能简化成「统一定时刷新」或「纯 WS 驱动」，否则会退化。
 */

/** 与旧实现一致。改动它会同时影响运行时长刷新粒度与对账频率。 */
const POLL_INTERVAL = 15_000

/** 旧全局 WS（`src/js/websocket.js`）。Vue 侧不另起连接，避免两份状态各自维护。 */
interface LegacyWebSocket {
  on(type: string, handler: (payload: unknown) => void): void
  off(type: string, handler: (payload: unknown) => void): void
}

function legacyWs(): LegacyWebSocket | null {
  const candidate = (globalThis as { WS?: LegacyWebSocket }).WS
  return candidate && typeof candidate.on === 'function' ? candidate : null
}

export interface RunRealtimeOptions {
  /**
   * 一条 `run-status` 推送处理完后回调，供页面做通知、端口诊断等副作用。
   * store 状态此时已更新。
   */
  onStatus?: (detail: { job: ReturnType<typeof useRunStore>['activeJobs'][string]; active: boolean }) => void
  /** 一条 `run-log` 推送。页面据 jobId 决定是否喂给 LogViewer。 */
  onLog?: (detail: { id: string; projectName: string; text: string; type: string }) => void
  /** 每次轮询滴答（含未请求后端的空闲滴答），用于驱动「运行时长」重算。 */
  onTick?: () => void
}

export function useRunRealtime(options: RunRealtimeOptions = {}) {
  const store = useRunStore()
  const { visible } = usePageVisibility()
  /** 自增计数：模板可依赖它触发运行时长重算，无需把 Date.now() 塞进 store。 */
  const tick = ref(0)

  const handleStatus = (payload: unknown) => {
    const detail = store.applyJob(payload)
    options.onStatus?.(detail)
  }

  const handleLog = (payload: unknown) => {
    const row = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    options.onLog?.({
      id: String(row.id ?? ''),
      projectName: String(row.projectName ?? ''),
      text: String(row.text ?? ''),
      type: String(row.type ?? 'info'),
    })
  }

  // 重连后全量对账。首连也会触发，reconcile 幂等故安全。
  const handleOpen = () => { void store.reconcile() }

  // useInterval 自行处理挂载启动与卸载停表
  const { start: startPolling, clear: stopPolling } = useInterval(() => {
    tick.value += 1
    options.onTick?.()
    // 空闲不打扰后端；页面不可见时也没有观众，省一次请求
    if (!store.hasRunning) return
    if (!visible.value) return
    void store.reconcile()
  }, POLL_INTERVAL)

  onMounted(() => {
    const ws = legacyWs()
    ws?.on('run-status', handleStatus)
    ws?.on('run-log', handleLog)
    ws?.on('open', handleOpen)
  })

  onBeforeUnmount(() => {
    const ws = legacyWs()
    ws?.off('run-status', handleStatus)
    ws?.off('run-log', handleLog)
    ws?.off('open', handleOpen)
  })

  return { tick, startPolling, stopPolling, pollInterval: POLL_INTERVAL }
}
