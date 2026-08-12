import { defineStore } from 'pinia'

import { apiClient } from '@/services/api-client'

export type Theme = 'dark' | 'light'
export type ThemeMode = Theme | 'system'
export type SidecarStatus = 'unknown' | 'checking' | 'online' | 'offline'

const THEME_KEY = 'devtools-theme'
const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']
let stopSystemThemeListener: (() => void) | null = null

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? value as ThemeMode : 'system'
}

export function readSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveThemeMode(mode: ThemeMode, systemTheme: Theme = readSystemTheme()): Theme {
  return mode === 'system' ? systemTheme : mode
}

function readThemeMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system'
  return normalizeThemeMode(localStorage.getItem(THEME_KEY))
}

export const useAppStore = defineStore('app', {
  state: () => {
    const themeMode = readThemeMode()
    return {
      themeMode,
      theme: resolveThemeMode(themeMode),
      sidecarStatus: 'unknown' as SidecarStatus,
      sidecarPort: null as number | null,
      initialized: false,
      initializing: false,
    }
  },

  actions: {
    applyThemeMode(mode: ThemeMode, options: { persist?: boolean } = {}) {
      const normalizedMode = normalizeThemeMode(mode)
      const effectiveTheme = resolveThemeMode(normalizedMode)
      this.themeMode = normalizedMode
      this.theme = effectiveTheme
      if (typeof document !== 'undefined') {
        document.body.setAttribute('data-theme-mode', normalizedMode)
        document.body.setAttribute('data-theme', effectiveTheme)
      }
      if (options.persist !== false && typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_KEY, normalizedMode)
      }
      // P8-4：通知 legacy 侧栏图标；DOM 写入仅由此处（及桥接调用）完成
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('devtools:theme-changed', {
          detail: { mode: normalizedMode, theme: effectiveTheme },
        }))
      }
    },

    applyTheme(theme: Theme) {
      this.applyThemeMode(theme)
    },

    syncTheme(mode: ThemeMode, effectiveTheme: Theme) {
      this.themeMode = normalizeThemeMode(mode)
      this.theme = effectiveTheme
    },

    startThemeSync() {
      stopSystemThemeListener?.()
      stopSystemThemeListener = null
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleSystemThemeChange = () => {
          if (this.themeMode === 'system') this.applyThemeMode('system', { persist: false })
        }
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', handleSystemThemeChange)
          stopSystemThemeListener = () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
        } else {
          mediaQuery.addListener(handleSystemThemeChange)
          stopSystemThemeListener = () => mediaQuery.removeListener(handleSystemThemeChange)
        }
      }
      this.applyThemeMode(this.themeMode, { persist: false })
    },

    stopThemeSync() {
      stopSystemThemeListener?.()
      stopSystemThemeListener = null
    },

    toggleTheme() {
      const currentIndex = THEME_MODES.indexOf(this.themeMode)
      this.applyThemeMode(THEME_MODES[(currentIndex + 1) % THEME_MODES.length])
    },

    async initialize() {
      if (this.initialized || this.initializing) return
      this.initializing = true
      this.sidecarStatus = 'checking'
      this.applyThemeMode(this.themeMode, { persist: false })
      try {
        await apiClient.initialize()
        this.sidecarPort = Number(new URL(apiClient.baseURL).port) || null
        await apiClient.get('/api/health', 5_000)
        this.sidecarStatus = 'online'
      } catch {
        this.sidecarStatus = 'offline'
      } finally {
        this.initialized = true
        this.initializing = false
      }
    },

    markSidecarOffline() {
      this.sidecarStatus = 'offline'
    },
  },
})
