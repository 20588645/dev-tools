import { describe, expect, it, vi } from 'vitest'

import { WebSocketClient } from './websocket-client'

class FakeSocket {
  readonly listeners = new Map<string, Set<EventListener>>()
  readonly sent: string[] = []

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener() {}

  close() {
    this.dispatch('close', new Event('close'))
  }

  send(data: string) {
    this.sent.push(data)
  }

  dispatch(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

describe('WebSocketClient', () => {
  it('returns an unsubscribe function and dispatches typed messages', () => {
    const socket = new FakeSocket()
    const client = new WebSocketClient<{ job: { id: string } }>({
      webSocketFactory: vi.fn(() => socket as unknown as WebSocket),
      maxReconnectAttempts: 0,
    })
    const handler = vi.fn()
    const stop = client.on('job', handler)

    client.connect(13900)
    socket.dispatch('message', new MessageEvent('message', {
      data: JSON.stringify({ type: 'job', data: { id: 'job-1' } }),
    }))
    expect(handler).toHaveBeenCalledWith({ id: 'job-1' })

    stop()
    socket.dispatch('message', new MessageEvent('message', {
      data: JSON.stringify({ type: 'job', data: { id: 'job-2' } }),
    }))
    expect(handler).toHaveBeenCalledTimes(1)
    client.close()
  })
})
