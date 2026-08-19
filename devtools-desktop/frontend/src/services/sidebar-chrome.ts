/** 侧栏折叠持久化（sessionStorage）。折叠态由 AppLayout 的 is-collapsed 驱动，不写 body class。 */

export const SIDEBAR_COLLAPSED_KEY = 'devtools-sidebar-collapsed'

export function readSidebarCollapsed(
  storage: Storage = globalThis.sessionStorage,
): boolean {
  try {
    const saved = storage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (saved === null) return false
    return saved === 'true'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage: Storage = globalThis.sessionStorage,
): void {
  try {
    storage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  } catch {
    /* private mode / unavailable */
  }
}

export function toggleSidebarCollapsed(
  storage: Storage = globalThis.sessionStorage,
): boolean {
  const next = !readSidebarCollapsed(storage)
  writeSidebarCollapsed(next, storage)
  return next
}
