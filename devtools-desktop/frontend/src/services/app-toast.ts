import type { NotificationTone } from '@/stores/notification'
import { useNotificationStore } from '@/stores/notification'

export interface ShowAppToastOptions {
  clickable?: boolean
  persistent?: boolean
  tone?: NotificationTone
  /** 可点击时的回调；默认派发 `devtools:log-reopen-requested`。 */
  onClick?: () => void
}

const LOG_REOPEN_EVENT = 'devtools:log-reopen-requested'

function defaultClickAction() {
  window.dispatchEvent(new CustomEvent(LOG_REOPEN_EVENT))
}

/**
 * 统一 Toast 入口：兼容旧 `showToast(title, message, options)` 签名，
 * 落地到 Pinia notification + Naive Message。
 */
export function showAppToast(
  title: string,
  message = '',
  options: ShowAppToastOptions = {},
) {
  const store = useNotificationStore()
  const text = message ? `${title}\n${message}` : title
  const duration = options.persistent
    ? 0
    : options.clickable
      ? 8_000
      : 5_000
  const onClick = options.clickable
    ? (options.onClick ?? defaultClickAction)
    : options.onClick

  return store.push(text, options.tone ?? 'info', duration, {
    clickable: Boolean(onClick),
    onClick,
  })
}
