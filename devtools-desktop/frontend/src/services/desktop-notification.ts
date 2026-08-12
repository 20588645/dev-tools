import {
  readNotificationEnabled,
  requestNotificationPermission,
} from '@/services/modules/settings-service'

const LOG_REOPEN_EVENT = 'devtools:log-reopen-requested'
const NOTIFICATION_ACTION_TTL = 2 * 60 * 1000

export interface DesktopNotificationOptions {
  target?: string
  force?: boolean
}

interface TauriNotificationApi {
  sendNotification?: (payload: {
    title: string
    body: string
    group?: string
    autoCancel?: boolean
    extra?: Record<string, string>
  }) => void
}

interface PendingNotificationAction {
  target: string
  createdAt: number
}

let pendingNotificationAction: PendingNotificationAction | null = null

function getTauriNotificationApi(): TauriNotificationApi | null {
  const windowLike = globalThis as typeof globalThis & {
    __TAURI__?: { notification?: TauriNotificationApi }
  }
  return windowLike.__TAURI__?.notification ?? null
}

function reopenLogModal() {
  window.dispatchEvent(new CustomEvent(LOG_REOPEN_EVENT))
}

function rememberNotificationAction(options: DesktopNotificationOptions = {}) {
  if (options.target !== 'log') return
  if (!document.hidden && document.hasFocus?.()) return

  pendingNotificationAction = {
    target: options.target,
    createdAt: Date.now(),
  }
}

function handlePendingNotificationAction() {
  if (!pendingNotificationAction) return
  if (Date.now() - pendingNotificationAction.createdAt > NOTIFICATION_ACTION_TTL) {
    pendingNotificationAction = null
    return
  }

  const action = pendingNotificationAction
  pendingNotificationAction = null
  if (action.target === 'log') {
    globalThis.setTimeout(() => reopenLogModal(), 80)
  }
}

/**
 * 系统桌面通知：权限申请、Tauri/Web 双通道，以及「点通知回到日志」的待办记账。
 * 取代 `app.js` 的 `sendDesktopNotification`。
 */
export async function sendDesktopNotification(
  title: string,
  body: string,
  isSuccess: boolean,
  options: DesktopNotificationOptions = {},
) {
  if (!readNotificationEnabled() && !options.force) return

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return

  try {
    rememberNotificationAction(options)
    const tauriNotification = getTauriNotificationApi()
    const notificationOptions = {
      title,
      body,
      group: 'devtools-tasks',
      autoCancel: true,
      extra: {
        status: isSuccess ? 'success' : 'fail',
        target: options.target || 'log',
      },
    }

    if (tauriNotification?.sendNotification) {
      tauriNotification.sendNotification(notificationOptions)
      return
    }

    if (!('Notification' in globalThis) || globalThis.Notification.permission !== 'granted') return
    const notification = new globalThis.Notification(title, {
      body,
      tag: `devtools-${Date.now()}`,
      requireInteraction: false,
      silent: false,
    })
    notification.onclick = () => {
      try { window.focus() } catch { /* jsdom may not implement focus */ }
      if (options.target === 'log') reopenLogModal()
      notification.close?.()
    }
    globalThis.setTimeout(() => notification.close?.(), 10_000)
  } catch (cause) {
    console.warn('桌面通知发送失败:', cause)
  }
}

/**
 * 常驻：焦点/可见性回来时兑现「点通知回到日志」；启动时按设置预申请权限。
 */
export function createDesktopNotificationService() {
  let started = false

  function onFocus() {
    handlePendingNotificationAction()
  }

  function onVisibility() {
    if (!document.hidden) handlePendingNotificationAction()
  }

  function start() {
    if (started) return
    started = true
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    void requestNotificationPermission()
  }

  function stop() {
    if (!started) return
    started = false
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { start, stop }
}

/** 测试用：清空待办动作。 */
export function resetDesktopNotificationPendingForTest() {
  pendingNotificationAction = null
}
