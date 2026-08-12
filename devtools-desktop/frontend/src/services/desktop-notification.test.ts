import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/modules/settings-service', () => ({
  readNotificationEnabled: vi.fn(() => true),
  requestNotificationPermission: vi.fn(async () => 'granted'),
}))

const settings = await import('@/services/modules/settings-service')
const {
  createDesktopNotificationService,
  resetDesktopNotificationPendingForTest,
  sendDesktopNotification,
} = await import('./desktop-notification')

beforeEach(() => {
  vi.clearAllMocks()
  resetDesktopNotificationPendingForTest()
  vi.mocked(settings.readNotificationEnabled).mockReturnValue(true)
  vi.mocked(settings.requestNotificationPermission).mockResolvedValue('granted')
  delete (window as { __TAURI__?: unknown }).__TAURI__
})

describe('sendDesktopNotification', () => {
  it('respects the user toggle unless force is set', async () => {
    vi.mocked(settings.readNotificationEnabled).mockReturnValue(false)
    const sendNotification = vi.fn()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      notification: { sendNotification },
    }

    await sendDesktopNotification('标题', '正文', true, { target: 'log' })
    expect(sendNotification).not.toHaveBeenCalled()

    await sendDesktopNotification('标题', '正文', true, { target: 'log', force: true })
    expect(sendNotification).toHaveBeenCalledOnce()
  })

  it('prefers the Tauri notification channel', async () => {
    const sendNotification = vi.fn()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      notification: { sendNotification },
    }

    await sendDesktopNotification('部署成功', 'demo 完成', true, { target: 'log' })

    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: '部署成功',
      body: 'demo 完成',
      extra: { status: 'success', target: 'log' },
    }))
  })

  it('web notifications reopen the log viewer on click', async () => {
    const NotificationMock = vi.fn(function NotificationMock(
      this: { onclick: null | (() => void); close: () => void },
      _title: string,
      _options?: NotificationOptions,
    ) {
      this.onclick = null
      this.close = vi.fn()
      return this
    })
    Object.defineProperty(NotificationMock, 'permission', { value: 'granted' })
    vi.stubGlobal('Notification', NotificationMock)
    vi.spyOn(window, 'focus').mockImplementation(() => undefined)

    const dispatch = vi.spyOn(window, 'dispatchEvent')
    await sendDesktopNotification('本地运行成功', 'demo 已启动', true, { target: 'log' })

    const instance = (NotificationMock.mock.results[0]?.value ?? null) as {
      onclick: null | (() => void)
    } | null
    instance?.onclick?.()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'devtools:log-reopen-requested',
    }))
    vi.unstubAllGlobals()
  })
})

describe('createDesktopNotificationService', () => {
  it('registers focus handlers once and cleans up on stop', () => {
    const addWindow = vi.spyOn(window, 'addEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const service = createDesktopNotificationService()

    service.start()
    service.start()
    expect(addWindow.mock.calls.filter((call) => call[0] === 'focus')).toHaveLength(1)
    expect(settings.requestNotificationPermission).toHaveBeenCalledOnce()

    service.stop()
    expect(removeWindow.mock.calls.filter((call) => call[0] === 'focus')).toHaveLength(1)
  })
})
