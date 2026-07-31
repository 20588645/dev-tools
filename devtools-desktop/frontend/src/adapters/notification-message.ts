import type { MessageApi, MessageOptions, MessageReactive } from 'naive-ui'

import type { NotificationItem, NotificationTone } from '@/stores/notification'

type ToastMessageApi = Pick<MessageApi, NotificationTone>
type RemoveNotification = (id: string) => void

export interface NotificationMessageBridge {
  sync: (items: readonly NotificationItem[]) => void
  dispose: () => void
}

/**
 * Adapts the project notification store to Naive UI's short-lived Message API.
 * Business consumers keep using the store and never depend on the UI library.
 */
export function createNotificationMessageBridge(
  message: ToastMessageApi,
  removeNotification: RemoveNotification,
): NotificationMessageBridge {
  const activeMessages = new Map<string, MessageReactive>()
  let disposed = false

  function removeAfterLeave(id: string) {
    activeMessages.delete(id)
    if (!disposed) removeNotification(id)
  }

  function show(item: NotificationItem) {
    const options: MessageOptions = {
      closable: true,
      duration: item.duration > 0 ? item.duration : 0,
      keepAliveOnHover: true,
      onAfterLeave: () => removeAfterLeave(item.id),
    }
    activeMessages.set(item.id, message[item.tone](item.message, options))
  }

  function sync(items: readonly NotificationItem[]) {
    if (disposed) return

    const currentIds = new Set(items.map((item) => item.id))
    activeMessages.forEach((handle, id) => {
      if (currentIds.has(id)) return
      activeMessages.delete(id)
      handle.destroy()
    })

    items.forEach((item) => {
      if (!activeMessages.has(item.id)) show(item)
    })
  }

  function dispose() {
    disposed = true
    activeMessages.forEach((handle) => handle.destroy())
    activeMessages.clear()
  }

  return { sync, dispose }
}
