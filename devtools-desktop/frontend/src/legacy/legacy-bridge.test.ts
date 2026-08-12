import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMigrationRouter } from '@/router'
import { getAppRouter, setAppRouter } from '@/router/navigate'

import {
  LEGACY_PAGE_IDS,
  HOME_REFRESH_REQUESTED_EVENT,
  UPGRADE_PROGRESS_EVENT,
  installUpgradeProgressBridge,
  isLegacyPageId,
  requestHomeRefresh,
  requestLegacyPage,
} from './legacy-bridge'

describe('legacy bridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setAppRouter(createMigrationRouter())
    delete (globalThis as { WS?: unknown }).WS
  })

  it('keeps the complete 13-page contract after report is absorbed into notes', () => {
    expect(LEGACY_PAGE_IDS).toHaveLength(13)
    expect(new Set(LEGACY_PAGE_IDS).size).toBe(13)
    expect(isLegacyPageId('report')).toBe(false)
    expect(isLegacyPageId('twofa')).toBe(true)
    expect(isLegacyPageId('unknown')).toBe(false)
  })

  it('requestLegacyPage delegates to router; home refresh still uses DOM event', async () => {
    const refreshListener = vi.fn()
    window.addEventListener(HOME_REFRESH_REQUESTED_EVENT, refreshListener)

    await requestLegacyPage('usage')
    expect(getAppRouter()?.currentRoute.value.path).toBe('/usage')

    requestHomeRefresh('runtime-change')
    expect((refreshListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'runtime-change' })

    window.removeEventListener(HOME_REFRESH_REQUESTED_EVENT, refreshListener)
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

  it('installUpgradeProgressBridge is a no-op when WS is missing', () => {
    expect(() => installUpgradeProgressBridge()()).not.toThrow()
  })
})
