import { describe, expect, it, vi } from 'vitest'

import {
  LEGACY_PAGE_ACTIVATED_EVENT,
  LEGACY_PAGE_IDS,
  HOME_REFRESH_REQUESTED_EVENT,
  isLegacyPageId,
  emitLegacyPageActivation,
  onLegacyPageActivation,
  requestHomeRefresh,
  requestLegacyPage,
} from './legacy-bridge'

describe('legacy bridge', () => {
  it('keeps the complete 14-page contract', () => {
    expect(LEGACY_PAGE_IDS).toHaveLength(14)
    expect(new Set(LEGACY_PAGE_IDS).size).toBe(14)
    expect(isLegacyPageId('twofa')).toBe(true)
    expect(isLegacyPageId('unknown')).toBe(false)
  })

  it('emits and unsubscribes activation events', () => {
    const listener = vi.fn()
    const stop = onLegacyPageActivation(listener)

    emitLegacyPageActivation({ pageId: 'run', source: 'legacy' })
    expect(listener).toHaveBeenCalledWith({ pageId: 'run', source: 'legacy' })

    stop()
    window.dispatchEvent(new CustomEvent(LEGACY_PAGE_ACTIVATED_EVENT, {
      detail: { pageId: 'usage', source: 'legacy' },
    }))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('requests legacy navigation and home refresh through DOM events', () => {
    const pageListener = vi.fn()
    const refreshListener = vi.fn()
    window.addEventListener('devtools:legacy-page-requested', pageListener)
    window.addEventListener(HOME_REFRESH_REQUESTED_EVENT, refreshListener)

    requestLegacyPage('usage')
    requestHomeRefresh('runtime-change')

    expect(pageListener).toHaveBeenCalledOnce()
    expect((pageListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ pageId: 'usage', source: 'vue' })
    expect((refreshListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'runtime-change' })

    window.removeEventListener('devtools:legacy-page-requested', pageListener)
    window.removeEventListener(HOME_REFRESH_REQUESTED_EVENT, refreshListener)
  })
})
