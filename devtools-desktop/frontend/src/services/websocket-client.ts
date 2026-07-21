export type WebSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting' | 'error'

export interface WebSocketClientOptions {
  path?: string
  baseDelay?: number
  maxDelay?: number
  maxReconnectAttempts?: number
  webSocketFactory?: (url: string) => WebSocket
}

type Handler<T> = (payload: T) => void

export class WebSocketClient<Events extends Record<string, unknown> = Record<string, unknown>> {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly handlers = new Map<string, Set<Handler<unknown>>>()
  private readonly path: string
  private readonly baseDelay: number
  private readonly maxDelay: number
  private readonly maxReconnectAttempts: number
  private readonly webSocketFactory: (url: string) => WebSocket
  private port: number | null = null
  private reconnectAttempts = 0
  private disposed = false

  status: WebSocketStatus = 'idle'

  constructor(options: WebSocketClientOptions = {}) {
    this.path = options.path ?? '/ws'
    this.baseDelay = options.baseDelay ?? 3_000
    this.maxDelay = options.maxDelay ?? 30_000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 50
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url))
  }

  connect(port: number) {
    if (this.disposed) return
    this.port = port
    this.clearReconnectTimer()
    this.socket?.close()
    this.status = 'connecting'

    try {
      const socket = this.webSocketFactory(`ws://127.0.0.1:${port}${this.path}`)
      this.socket = socket
      socket.addEventListener('open', () => {
        this.status = 'open'
        this.reconnectAttempts = 0
        this.emit('open', undefined)
      })
      socket.addEventListener('message', (event) => this.handleMessage(event.data))
      socket.addEventListener('error', (event) => {
        this.status = 'error'
        this.emit('error', event)
      })
      socket.addEventListener('close', () => {
        this.status = 'closed'
        this.emit('close', undefined)
        this.scheduleReconnect()
      })
    } catch (error) {
      this.status = 'error'
      this.emit('error', error)
      this.scheduleReconnect()
    }
  }

  close() {
    this.disposed = true
    this.clearReconnectTimer()
    this.socket?.close()
    this.socket = null
    this.status = 'closed'
  }

  reconnect(port = this.port ?? undefined) {
    if (!port) return
    this.disposed = false
    this.reconnectAttempts = 0
    this.connect(port)
  }

  send(payload: unknown) {
    if (this.status !== 'open' || !this.socket) {
      throw new Error('WebSocket 尚未连接')
    }
    this.socket.send(JSON.stringify(payload))
  }

  on<K extends keyof Events & string>(type: K, handler: Handler<Events[K]>): () => void
  on(type: 'open' | 'close' | 'error', handler: Handler<unknown>): () => void
  on(type: string, handler: (...args: never[]) => void) {
    const handlers = this.handlers.get(type) ?? new Set<Handler<unknown>>()
    handlers.add(handler as Handler<unknown>)
    this.handlers.set(type, handlers)
    const registeredHandler = handler as Handler<unknown>
    return () => handlers.delete(registeredHandler)
  }

  private emit(type: string, payload: unknown) {
    this.handlers.get(type)?.forEach((handler) => handler(payload))
  }

  private handleMessage(data: unknown) {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data
      if (!message || typeof message !== 'object' || !('type' in message)) return
      this.emit(String(message.type), 'data' in message ? message.data : undefined)
    } catch (error) {
      this.emit('error', error)
    }
  }

  private scheduleReconnect() {
    if (this.disposed || !this.port || this.reconnectAttempts >= this.maxReconnectAttempts) return
    this.clearReconnectTimer()
    const delay = Math.min(this.baseDelay * 2 ** this.reconnectAttempts, this.maxDelay)
    this.reconnectAttempts += 1
    this.status = 'reconnecting'
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null
      if (this.port) this.connect(this.port)
    }, delay)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) globalThis.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
