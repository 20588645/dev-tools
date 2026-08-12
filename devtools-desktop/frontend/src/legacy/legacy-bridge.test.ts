import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMigrationRouter } from '@/router'
import { getAppRouter, setAppRouter } from '@/router/navigate'

import {
  LEGACY_PAGE_IDS,
  HOME_REFRESH_REQUESTED_EVENT,
  isLegacyPageId,
  requestHomeRefresh,
  requestLegacyPage,
} from './legacy-bridge'

describe('legacy bridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setAppRouter(createMigrationRouter())
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
})
