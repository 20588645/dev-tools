import { defineStore } from 'pinia'

export type NotificationTone = 'info' | 'success' | 'warning' | 'error'

export interface NotificationPushOptions {
  clickable?: boolean
  onClick?: () => void
}

export interface NotificationItem {
  id: string
  message: string
  tone: NotificationTone
  duration: number
  clickable?: boolean
  onClick?: () => void
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [] as NotificationItem[],
  }),

  actions: {
    push(
      message: string,
      tone: NotificationTone = 'info',
      duration = 4_000,
      options: NotificationPushOptions = {},
    ) {
      const item: NotificationItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        tone,
        duration,
        clickable: options.clickable,
        onClick: options.onClick,
      }
      this.items.push(item)
      return item.id
    },

    remove(id: string) {
      this.items = this.items.filter((item) => item.id !== id)
    },

    clear() {
      this.items = []
    },
  },
})
