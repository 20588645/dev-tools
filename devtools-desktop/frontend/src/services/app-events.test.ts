import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_REFRESH_REQUESTED_EVENT,
  UPGRADE_PROGRESS_EVENT,
  installUpgradeProgressBridge,
  requestHomeRefresh,
} from './app-events'

describe('app events', () => {
  beforeEach(() => {
    delete (globalThis as { WS?: unknown }).WS
  })

  it('home refresh uses a typed DOM event', () => {
    const listener = vi.fn()
    window.addEventListener(HOME_REFRESH_REQUESTED_EVENT, listener)

    requestHomeRefresh('runtime-change')
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'runtime-change' })

    window.removeEventListener(HOME_REFRESH_REQUESTED_EVENT, listener)
  })

  it('bridges WS upgrade-progress into a window event and cleans up', () => {
    const handlers = new Map<string, Set<(payload: unknown) => void>>()
    ;(globalThis as { WS?: unknown }).WS = {
      on(type: string, handler: (payload: unknown) => void) {
        if (!handlers.has(type)) handlers.set(type, new Set())
        handlers.get(type)!.add(handler)
      },
      off(type: string, handler: (payload: unknown) => void) {
        handlers.get(type)?.delete(handler)
      },
    }
    const listener = vi.fn()
    window.addEventListener(UPGRADE_PROGRESS_EVENT, listener)
    const stop = installUpgradeProgressBridge()

    handlers.get('upgrade-progress')?.forEach((handler) => handler({ percent: 42 }))
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ percent: 42 })

    stop()
    expect(handlers.get('upgrade-progress')?.size ?? 0).toBe(0)
    window.removeEventListener(UPGRADE_PROGRESS_EVENT, listener)
  })

  it('installUpgradeProgressBridge is a no-op when realtime is absent', () => {
    expect(() => installUpgradeProgressBridge()()).not.toThrow()
  })
})
