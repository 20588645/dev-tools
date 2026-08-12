/** 侧栏折叠 / 菜单序 chrome（P8-4）；生产 DOM 仍由 legacy 驱动直到 P8-5 */

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
  options: { syncBody?: boolean } = {},
): void {
  try {
    storage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  } catch {
    /* private mode / unavailable */
  }
  if (options.syncBody && typeof document !== 'undefined') {
    document.body.classList.toggle('sidebar-collapsed', collapsed)
  }
}

export function toggleSidebarCollapsed(
  storage: Storage = globalThis.sessionStorage,
  options: { syncBody?: boolean } = {},
): boolean {
  const next = !readSidebarCollapsed(storage)
  writeSidebarCollapsed(next, storage, options)
  return next
}
