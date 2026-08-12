import { watch, type WatchStopHandle } from 'vue'

import { keepaliveSftp } from '@/services/modules/filetransfer-service'
import { realtimeWs } from '@/services/realtime'
import { useFileTransferStore, type TransferEventPayload } from '@/stores/file-transfer'

/**
 * 应用级文件传输会话宿主。
 *
 * keepalive 与 `transfer` WS 不能挂在 KeepAlive 会 deactivate 的页面组件上：
 * 切走「文件传输」页时 UI 隐藏，但 SFTP 会话与队列进度必须继续。
 * 挂在 AppShellServices，与 deploy-realtime / run-runtime 同模式。
 */

const KEEPALIVE_MS = 60 * 1000

function asPayload(value: unknown): TransferEventPayload {
  if (!value || typeof value !== 'object') return {}
  return value as TransferEventPayload
}

export function createFileTransferSessionService() {
  const store = useFileTransferStore()
  const timers = new Map<number, ReturnType<typeof setInterval>>()
  let stopWatch: WatchStopHandle | null = null
  let started = false

  const handleTransfer = (payload: unknown) => {
    store.applyTransferEvent(asPayload(payload))
  }

  async function doKeepalive(tabId: number) {
    const tab = store.tabs.find((t) => t.id === tabId)
    if (!tab?.sessionId) {
      stopTimer(tabId)
      return
    }
    try {
      await keepaliveSftp(tab.sessionId)
    } catch {
      store.handleSessionLost(tabId)
    }
  }

  function startTimer(tabId: number) {
    if (timers.has(tabId)) return
    timers.set(tabId, setInterval(() => { void doKeepalive(tabId) }, KEEPALIVE_MS))
  }

  function stopTimer(tabId: number) {
    const timer = timers.get(tabId)
    if (timer) {
      clearInterval(timer)
      timers.delete(tabId)
    }
  }

  function syncTimers() {
    const alive = new Set(store.tabs.map((t) => t.id))
    for (const id of timers.keys()) {
      if (!alive.has(id)) stopTimer(id)
    }
    for (const tab of store.tabs) {
      startTimer(tab.id)
    }
  }

  function start() {
    if (started) return
    started = true
    const ws = realtimeWs()
    ws?.on('transfer', handleTransfer)
    stopWatch = watch(
      () => store.tabs.map((t) => t.id).join(','),
      () => { syncTimers() },
      { immediate: true },
    )
  }

  function stop() {
    if (!started) return
    started = false
    stopWatch?.()
    stopWatch = null
    const ws = realtimeWs()
    ws?.off('transfer', handleTransfer)
    for (const id of [...timers.keys()]) stopTimer(id)
  }

  return { start, stop }
}
