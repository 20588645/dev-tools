import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  normalizeThemeMode,
  resolveThemeMode,
  useAppStore,
  type Theme,
} from './app'

function createMatchMedia(initialTheme: Theme) {
  let matches = initialTheme === 'dark'
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  return {
    mediaQuery,
    setTheme(theme: Theme) {
      matches = theme === 'dark'
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent
      listeners.forEach(listener => listener(event))
    },
  }
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, String(value))
    },
  }
}

describe('app theme store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    localStorage.clear()
    document.body.removeAttribute('data-theme')
    document.body.removeAttribute('data-theme-mode')
    setActivePinia(createPinia())
  })

  afterEach(() => {
    useAppStore().stopThemeSync()
    vi.unstubAllGlobals()
  })

  it('normalizes legacy values and resolves system appearance', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('unknown')).toBe('system')
    expect(resolveThemeMode('system', 'dark')).toBe('dark')
    expect(resolveThemeMode('system', 'light')).toBe('light')
  })

  it('tracks system changes only while system mode is active', () => {
    const matchMedia = createMatchMedia('light')
    vi.stubGlobal('matchMedia', vi.fn(() => matchMedia.mediaQuery))

    const app = useAppStore()
    app.startThemeSync()

    expect(app.themeMode).toBe('system')
    expect(app.theme).toBe('light')
    expect(document.body.getAttribute('data-theme-mode')).toBe('system')
    expect(document.body.getAttribute('data-theme')).toBe('light')

    matchMedia.setTheme('dark')
    expect(app.theme).toBe('dark')
    expect(document.body.getAttribute('data-theme')).toBe('dark')

    app.applyThemeMode('light')
    matchMedia.setTheme('dark')
    expect(app.themeMode).toBe('light')
    expect(app.theme).toBe('light')
    expect(localStorage.getItem('devtools-theme')).toBe('light')

    app.stopThemeSync()
  })

  it('persists theme and emits theme-changed', () => {
    const app = useAppStore()
    const spy = vi.fn()
    window.addEventListener('devtools:theme-changed', spy)
    app.applyThemeMode('dark')
    expect(localStorage.getItem('devtools-theme')).toBe('dark')
    expect(document.body.getAttribute('data-theme-mode')).toBe('dark')
    expect(spy).toHaveBeenCalled()
    window.removeEventListener('devtools:theme-changed', spy)
  })
})
