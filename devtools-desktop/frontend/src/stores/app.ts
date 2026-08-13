import { defineStore } from 'pinia'

import { apiClient } from '@/services/api-client'
import {
  ACCENT_TOKEN_NAMES,
  deriveAccentPalette,
  isValidAccentHex,
} from '@/services/theme-accent'

export type Theme = 'dark' | 'light'
export type ThemeMode = Theme | 'system'
export type SidecarStatus = 'unknown' | 'checking' | 'online' | 'offline'

const THEME_KEY = 'devtools-theme'
const ACCENT_KEY = 'devtools-accent'
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

function readAccentColor(): string | null {
  if (typeof localStorage === 'undefined') return null
  const saved = localStorage.getItem(ACCENT_KEY)
  return isValidAccentHex(saved) ? saved.toLowerCase() : null
}

export const useAppStore = defineStore('app', {
  state: () => {
    const themeMode = readThemeMode()
    return {
      themeMode,
      theme: resolveThemeMode(themeMode),
      /** 运行时主题色（氛围色板换肤）；null = 跟随主题默认蓝紫 */
      accentColor: readAccentColor(),
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

    /**
     * 运行时切换主题色（accent 系 token 整组覆盖，状态色不跟随）。
     * 传 null 恢复主题默认；对比度不足的主色由推导层自动加深。
     */
    applyAccentColor(color: string | null, options: { persist?: boolean } = {}) {
      const valid = isValidAccentHex(color) ? color : null
      let applied: string | null = null
      if (typeof document !== 'undefined') {
        const rootStyle = document.documentElement.style
        if (valid) {
          const palette = deriveAccentPalette(valid)
          applied = palette.accent
          rootStyle.setProperty('--color-action', palette.accent)
          rootStyle.setProperty('--color-action-hover', palette.hover)
          rootStyle.setProperty('--color-action-secondary', palette.secondary)
          rootStyle.setProperty('--color-action-gradient', palette.gradient)
          rootStyle.setProperty('--color-action-subtle', palette.subtle)
          rootStyle.setProperty('--color-focus-ring', palette.accent)
        } else {
          for (const name of ACCENT_TOKEN_NAMES) rootStyle.removeProperty(name)
        }
      } else if (valid) {
        applied = deriveAccentPalette(valid).accent
      }
      this.accentColor = applied
      if (options.persist !== false && typeof localStorage !== 'undefined') {
        if (applied) localStorage.setItem(ACCENT_KEY, applied)
        else localStorage.removeItem(ACCENT_KEY)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('devtools:accent-changed', {
          detail: { color: applied },
        }))
      }
    },

    resetAccentColor() {
      this.applyAccentColor(null)
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
      this.applyAccentColor(this.accentColor, { persist: false })
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
