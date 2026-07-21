import { defineStore } from 'pinia'

import { apiClient } from '@/services/api-client'

const DEFAULT_CONNECTION_TIMEOUT = 60

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    connectionTimeoutSec: DEFAULT_CONNECTION_TIMEOUT,
    loaded: false,
    loading: false,
  }),

  actions: {
    async load() {
      if (this.loaded || this.loading) return
      this.loading = true
      try {
        const settings = await apiClient.get<{ connTimeoutSec?: number }>('/api/settings')
        const value = Number(settings?.connTimeoutSec)
        if (Number.isFinite(value)) {
          this.connectionTimeoutSec = Math.min(Math.max(value, 5), 300)
        }
        this.loaded = true
      } finally {
        this.loading = false
      }
    },

    setConnectionTimeout(seconds: number) {
      if (!Number.isFinite(seconds)) return
      this.connectionTimeoutSec = Math.min(Math.max(seconds, 5), 300)
    },
  },
})
