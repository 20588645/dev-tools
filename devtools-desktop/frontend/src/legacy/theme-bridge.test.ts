import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installThemeBridge, isThemeBridgeInstalled } from '@/legacy/theme-bridge'
import { useAppStore } from '@/stores/app'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

describe('theme-bridge', () => {
  let stop: (() => void) | null = null

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    document.body.removeAttribute('data-theme')
    document.body.removeAttribute('data-theme-mode')
    delete window.__devtoolsApplyThemeMode
    setActivePinia(createPinia())
  })

  afterEach(() => {
    stop?.()
    stop = null
    useAppStore().stopThemeSync()
    vi.unstubAllGlobals()
  })

  it('installs bridge that writes through Pinia', () => {
    const app = useAppStore()
    stop = installThemeBridge()
    expect(isThemeBridgeInstalled()).toBe(true)

    window.__devtoolsApplyThemeMode?.('dark')
    expect(app.themeMode).toBe('dark')
    expect(app.theme).toBe('dark')
    expect(document.body.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('devtools-theme')).toBe('dark')
  })

  it('dispatches theme-changed from store apply', () => {
    const spy = vi.fn()
    window.addEventListener('devtools:theme-changed', spy)
    stop = installThemeBridge()
    window.__devtoolsApplyThemeMode?.('light')
    expect(spy).toHaveBeenCalled()
    const detail = spy.mock.calls[0]?.[0]?.detail
    expect(detail).toEqual({ mode: 'light', theme: 'light' })
    window.removeEventListener('devtools:theme-changed', spy)
  })
})
