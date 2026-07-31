import type { MessageApi, MessageOptions, MessageReactive } from 'naive-ui'
import { describe, expect, it, vi } from 'vitest'

import type { NotificationItem, NotificationTone } from '@/stores/notification'

import { createNotificationMessageBridge } from './notification-message'

function createMessageApi() {
  const handles: MessageReactive[] = []
  const calls: Array<{ tone: NotificationTone, content: string, options?: MessageOptions }> = []

  const create = (tone: NotificationTone) => (content: string, options?: MessageOptions) => {
    const handle = { type: tone, destroy: vi.fn() } as MessageReactive
    calls.push({ tone, content, options })
    handles.push(handle)
    return handle
  }

  const api = {
    info: create('info'),
    success: create('success'),
    warning: create('warning'),
    error: create('error'),
  } as Pick<MessageApi, NotificationTone>

  return { api, calls, handles }
}

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notification-1',
    message: '保存成功',
    tone: 'success',
    duration: 4_000,
    ...overrides,
  }
}

describe('notification message adapter', () => {
  it('maps the project tone and lifecycle options to Naive Message', () => {
    const { api, calls } = createMessageApi()
    const remove = vi.fn()
    const bridge = createNotificationMessageBridge(api, remove)

    bridge.sync([item()])

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ tone: 'success', content: '保存成功' })
    expect(calls[0]?.options).toMatchObject({
      closable: true,
      duration: 4_000,
      keepAliveOnHover: true,
    })
    calls[0]?.options?.onAfterLeave?.()
    expect(remove).toHaveBeenCalledWith('notification-1')
  })

  it('keeps non-positive durations visible until explicitly closed', () => {
    const { api, calls } = createMessageApi()
    const bridge = createNotificationMessageBridge(api, vi.fn())

    bridge.sync([item({ duration: 0 })])

    expect(calls[0]?.options?.duration).toBe(0)
  })

  it('destroys visible messages when remove or clear changes the store', () => {
    const { api, handles } = createMessageApi()
    const bridge = createNotificationMessageBridge(api, vi.fn())
    const first = item()
    const second = item({ id: 'notification-2', tone: 'error' })

    bridge.sync([first, second])
    bridge.sync([second])
    expect(handles[0]?.destroy).toHaveBeenCalledOnce()
    expect(handles[1]?.destroy).not.toHaveBeenCalled()

    bridge.sync([])
    expect(handles[1]?.destroy).toHaveBeenCalledOnce()
  })

  it('destroys all handles on disposal without mutating the store', () => {
    const { api, handles, calls } = createMessageApi()
    const remove = vi.fn()
    const bridge = createNotificationMessageBridge(api, remove)

    bridge.sync([item()])
    bridge.dispose()
    calls[0]?.options?.onAfterLeave?.()

    expect(handles[0]?.destroy).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })
})
