import { defineStore } from 'pinia'

import { apiClient } from '@/services/api-client'

const DEFAULT_CONNECTION_TIMEOUT = 60
const normalizeTimeout = (value: unknown) => {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? Math.min(Math.max(Math.round(seconds), 5), 300) : DEFAULT_CONNECTION_TIMEOUT
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    connectionTimeoutSec: DEFAULT_CONNECTION_TIMEOUT,
    loaded: false,
    loading: false,
    saving: false,
    error: '',
  }),

  actions: {
    async load(options: { force?: boolean; signal?: AbortSignal } = {}) {
      if ((!options.force && this.loaded) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        const settings = await apiClient.request<{ connTimeoutSec?: number }>('/api/settings', {
          signal: options.signal,
        })
        this.connectionTimeoutSec = normalizeTimeout(settings?.connTimeoutSec)
        this.loaded = true
      } catch (reason) {
        if (options.signal?.aborted) return
        this.error = reason instanceof Error ? reason.message : '连接设置加载失败'
        throw reason
      } finally {
        this.loading = false
      }
    },

    setConnectionTimeout(seconds: number) {
      this.connectionTimeoutSec = normalizeTimeout(seconds)
    },

    async saveConnectionTimeout(seconds: number) {
      this.saving = true
      this.error = ''
      try {
        const settings = await apiClient.put<{ connTimeoutSec?: number }>('/api/settings', {
          connTimeoutSec: normalizeTimeout(seconds),
        })
        this.connectionTimeoutSec = normalizeTimeout(settings?.connTimeoutSec)
        this.loaded = true
        return this.connectionTimeoutSec
      } catch (reason) {
        this.error = reason instanceof Error ? reason.message : '连接设置保存失败'
        throw reason
      } finally {
        this.saving = false
      }
    },
  },
})
