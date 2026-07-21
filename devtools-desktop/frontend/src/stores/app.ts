import { defineStore } from 'pinia'

import { apiClient } from '@/services/api-client'

export type Theme = 'dark' | 'light'
export type SidecarStatus = 'unknown' | 'checking' | 'online' | 'offline'

const THEME_KEY = 'devtools-theme'

function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark'
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: readTheme() as Theme,
    sidecarStatus: 'unknown' as SidecarStatus,
    sidecarPort: null as number | null,
    initialized: false,
    initializing: false,
  }),

  actions: {
    applyTheme(theme: Theme) {
      this.theme = theme
      if (typeof document !== 'undefined') document.body.setAttribute('data-theme', theme)
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme)
    },

    toggleTheme() {
      this.applyTheme(this.theme === 'dark' ? 'light' : 'dark')
    },

    async initialize() {
      if (this.initialized || this.initializing) return
      this.initializing = true
      this.sidecarStatus = 'checking'
      this.applyTheme(this.theme)
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
