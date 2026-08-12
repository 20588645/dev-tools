import { apiClient } from '@/services/api-client'
import { WebSocketClient } from '@/services/websocket-client'

/**
 * 应用级共享实时连接。P9-5 取代经典 `src/js/websocket.js` 的 `window.WS`。
 *
 * - 单例：与旧实现一致，全应用共用一条 `/ws` 连接；常驻服务与页面 composable
 *   经 `realtimeWs()` 取同一实例订阅。
 * - 测试注入：`globalThis.WS` 优先返回——既有服务测试全部用假 WS 驱动，
 *   不建真实连接；生产环境已无人写这个全局。
 * - 端口发现：复用 `apiClient.initialize()`；设置页重启 Sidecar 后经
 *   `devtools:sidecar-restarted` 事件切端口重连（HTTP 基址由 useSettings 自改）。
 */

export interface RealtimeWs {
  on(type: string, handler: (payload: unknown) => void): void
  off(type: string, handler: (payload: unknown) => void): void
  /** 连接已建立可发送。测试假 WS 可不实现（视作未连接）。 */
  readonly connected?: boolean
  /** 发送 `{type, data}`；未连接时丢弃并返回 false。测试假 WS 可不实现。 */
  send?(type: string, data?: unknown): boolean
}

/** 与 `legacy-bridge.ts` 的常量一致；字面量书写以避免 services → legacy 的环形依赖。 */
const SIDECAR_RESTARTED_EVENT = 'devtools:sidecar-restarted'
const DEFAULT_PORT = 13456

/**
 * 把 `WebSocketClient`（`on` 返回退订函数）适配成旧 `WS.on/off` 形状，
 * 六个既有消费方与其测试假件都按这个形状工作，不必逐个改写订阅协议。
 */
export class RealtimeAdapter implements RealtimeWs {
  readonly client: WebSocketClient
  private readonly subscriptions = new Map<string, Map<(payload: unknown) => void, () => void>>()

  constructor(client: WebSocketClient = new WebSocketClient()) {
    this.client = client
  }

  on(type: string, handler: (payload: unknown) => void) {
    let forType = this.subscriptions.get(type)
    if (!forType) {
      forType = new Map()
      this.subscriptions.set(type, forType)
    }
    if (forType.has(handler)) return
    forType.set(handler, this.client.on(type, handler))
  }

  off(type: string, handler: (payload: unknown) => void) {
    const forType = this.subscriptions.get(type)
    const unsubscribe = forType?.get(handler)
    if (!unsubscribe) return
    unsubscribe()
    forType?.delete(handler)
  }

  get connected() {
    return this.client.status === 'open'
  }

  send(type: string, data?: unknown) {
    if (!this.connected) return false
    try {
      this.client.send({ type, data })
      return true
    } catch {
      return false
    }
  }
}

let adapter: RealtimeAdapter | null = null
let booted = false

/**
 * 当前实时连接。生产返回 `startRealtime()` 建立的单例；
 * 测试通过 `globalThis.WS` 注入假件（优先返回），未注入未启动时为 null。
 */
export function realtimeWs(): RealtimeWs | null {
  const injected = (globalThis as { WS?: RealtimeWs }).WS
  if (injected && typeof injected.on === 'function') return injected
  return adapter
}

async function connectFromApiBase(client: WebSocketClient) {
  try {
    const baseUrl = await apiClient.initialize()
    const port = Number(new URL(baseUrl).port) || DEFAULT_PORT
    client.connect(port)
  } catch (cause) {
    console.warn('[realtime] Sidecar 端口发现失败，WS 暂不连接', cause)
  }
}

/**
 * 建立单例并异步连接。必须在应用壳挂载前调用（`main.ts`），
 * 让常驻服务 `onMounted` 时就能拿到实例注册处理器——注册不依赖连接完成，
 * 连上后的 `open` 事件会触发各服务对账。
 */
export function startRealtime(): RealtimeWs {
  if (!adapter) adapter = new RealtimeAdapter()
  if (booted) return adapter
  booted = true

  void connectFromApiBase(adapter.client)

  window.addEventListener(SIDECAR_RESTARTED_EVENT, (event) => {
    const port = Number((event as CustomEvent<{ port?: number }>).detail?.port)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return
    adapter?.client.reconnect(port)
  })

  // 原 index.html 内联脚本的职责：未捕获错误上报 Sidecar 终端，便于打包环境排查
  window.addEventListener('error', (event) => {
    adapter?.send('frontend-error', {
      message: event.message,
      stack: event.error instanceof Error ? (event.error.stack ?? '') : '',
    })
  })

  return adapter
}

/** 测试用：断开并清空单例。 */
export function resetRealtimeForTest() {
  adapter?.client.close()
  adapter = null
  booted = false
}
