import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotificationStore } from '@/stores/notification'

import { showAppToast } from './app-toast'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('showAppToast', () => {
  it('formats title and message into one notification', () => {
    const store = useNotificationStore()
    showAppToast('标题', '详情')
    expect(store.items).toHaveLength(1)
    expect(store.items[0]?.message).toBe('标题\n详情')
    expect(store.items[0]?.duration).toBe(5_000)
  })

  it('marks clickable toasts and defaults to log reopen', () => {
    const store = useNotificationStore()
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    showAppToast('仍在运行', '点击查看', { clickable: true, persistent: true })

    const item = store.items[0]
    expect(item?.clickable).toBe(true)
    expect(item?.duration).toBe(0)
    item?.onClick?.()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'devtools:log-reopen-requested',
    }))
  })

  it('uses a longer auto-dismiss window for non-persistent clickable toasts', () => {
    const store = useNotificationStore()
    showAppToast('恢复任务', '已运行 3s', { clickable: true })
    expect(store.items[0]?.duration).toBe(8_000)
  })
})
