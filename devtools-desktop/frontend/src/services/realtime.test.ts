import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebSocketClient } from '@/services/websocket-client'

vi.mock('@/services/api-client', () => ({
  apiClient: {
    initialize: vi.fn(() => Promise.reject(new Error('test: no sidecar'))),
  },
}))

const { RealtimeAdapter, realtimeWs, resetRealtimeForTest, startRealtime } = await import('./realtime')

class FakeSocket {
  static instances: FakeSocket[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(handler)
  }

  emit(type: string, event: unknown = undefined) {
    this.listeners.get(type)?.forEach((handler) => handler(event))
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.emit('close')
  }
}

function createClientWithFakeSocket() {
  FakeSocket.instances = []
  return new WebSocketClient({
    webSocketFactory: (url) => new FakeSocket(url) as unknown as WebSocket,
  })
}

beforeEach(() => {
  delete (globalThis as { WS?: unknown }).WS
  resetRealtimeForTest()
})

afterEach(() => {
  resetRealtimeForTest()
  vi.restoreAllMocks()
})

describe('RealtimeAdapter', () => {
  it('maps on/off onto the unsubscribe-based client without duplicates', () => {
    const client = createClientWithFakeSocket()
    const adapter = new RealtimeAdapter(client)
    const handler = vi.fn()

    adapter.on('run-status', handler)
    adapter.on('run-status', handler)
    client.connect(13456)
    FakeSocket.instances[0]!.emit('message', { data: JSON.stringify({ type: 'run-status', data: { id: 'r1' } }) })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ id: 'r1' })

    adapter.off('run-status', handler)
    FakeSocket.instances[0]!.emit('message', { data: JSON.stringify({ type: 'run-status', data: {} }) })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('send is a guarded no-op until the socket is open', () => {
    const client = createClientWithFakeSocket()
    const adapter = new RealtimeAdapter(client)

    expect(adapter.connected).toBe(false)
    expect(adapter.send('terminal-input', { data: 'ls' })).toBe(false)

    client.connect(13456)
    const socket = FakeSocket.instances[0]!
    socket.emit('open')

    expect(adapter.connected).toBe(true)
    expect(adapter.send('terminal-input', { data: 'ls' })).toBe(true)
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'terminal-input', data: { data: 'ls' } })
  })
})

describe('realtimeWs', () => {
  it('prefers the globalThis.WS test seam over the singleton', () => {
    const fake = { on: vi.fn(), off: vi.fn() }
    ;(globalThis as { WS?: unknown }).WS = fake
    expect(realtimeWs()).toBe(fake)
  })

  it('returns null before startRealtime and the singleton afterwards', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(realtimeWs()).toBeNull()
    const started = startRealtime()
    expect(realtimeWs()).toBe(started)
    expect(startRealtime()).toBe(started)
    void warn
  })
})
