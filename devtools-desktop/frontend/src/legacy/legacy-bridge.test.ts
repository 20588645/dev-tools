import { describe, expect, it, vi } from 'vitest'

import {
  LEGACY_PAGE_ACTIVATED_EVENT,
  LEGACY_PAGE_IDS,
  isLegacyPageId,
  emitLegacyPageActivation,
  onLegacyPageActivation,
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
})
