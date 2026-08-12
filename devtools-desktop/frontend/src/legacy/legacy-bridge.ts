import { navigateToPage } from '@/router/navigate'
import { realtimeWs } from '@/services/realtime'

export const LEGACY_PAGE_IDS = [
  'home',
  'run',
  'deploy',
  'filetransfer',
  'terminal',
  'todo',
  'notes',
  'notebook',
  'editor',
  'ipcheck',
  'twofa',
  'usage',
  'settings',
] as const

export type LegacyPageId = typeof LEGACY_PAGE_IDS[number]

export const HOME_REFRESH_REQUESTED_EVENT = 'devtools:home-refresh-requested'
export const MENU_ORDER_CHANGED_EVENT = 'devtools:menu-order-changed'
export const EXPERIMENTAL_SETTING_CHANGED_EVENT = 'devtools:experimental-setting-changed'
export const SIDECAR_RESTARTED_EVENT = 'devtools:sidecar-restarted'
export const UPGRADE_PROGRESS_EVENT = 'devtools:upgrade-progress'

export interface HomeRefreshRequestDetail {
  reason: 'activation' | 'runtime-change' | 'manual'
}

export interface SidecarRestartedDetail {
  port: number
}

export interface ExperimentalSettingChangedDetail {
  key: 'live2d' | 'click-effect'
  enabled: boolean
}

export interface UpgradeProgressDetail {
  event?: 'Started' | 'Progress' | 'Finished' | 'Error' | string
  percent?: number
  log?: string
}

export function isLegacyPageId(value: unknown): value is LegacyPageId {
  return typeof value === 'string' && LEGACY_PAGE_IDS.includes(value as LegacyPageId)
}

/** @deprecated 使用 navigateToPage；保留别名以免漏改调用点 */
export function requestLegacyPage(pageId: LegacyPageId) {
  return navigateToPage(pageId)
}

/**
 * 页面离开守卫：Router beforeEach 与 registerPageLeaveGuard（editor 脏确认）共用。
 */
export type PageLeaveGuard = () => boolean | Promise<boolean>

const pageLeaveGuards = new Map<LegacyPageId, PageLeaveGuard>()

export function registerPageLeaveGuard(pageId: LegacyPageId, guard: PageLeaveGuard): () => void {
  pageLeaveGuards.set(pageId, guard)
  return () => {
    if (pageLeaveGuards.get(pageId) === guard) pageLeaveGuards.delete(pageId)
  }
}

export async function runPageLeaveGuards(pageId: string): Promise<boolean> {
  if (!isLegacyPageId(pageId)) return true
  const guard = pageLeaveGuards.get(pageId)
  if (!guard) return true
  try {
    return Boolean(await guard())
  } catch {
    return false
  }
}

export function requestHomeRefresh(reason: HomeRefreshRequestDetail['reason'] = 'manual') {
  window.dispatchEvent(new CustomEvent<HomeRefreshRequestDetail>(HOME_REFRESH_REQUESTED_EVENT, {
    detail: { reason },
  }))
}

/**
 * WS `upgrade-progress` → window 事件桥（P9-4 自 `app.js` 迁入）。
 * 设置页的升级进度对话框监听 `UPGRADE_PROGRESS_EVENT`，与 WS 解耦；
 * P9-5 起经共享实时连接（`services/realtime.ts`）订阅。
 */
export function installUpgradeProgressBridge(): () => void {
  const ws = realtimeWs()
  if (!ws) return () => {}
  const handler = (payload: unknown) => {
    window.dispatchEvent(new CustomEvent(UPGRADE_PROGRESS_EVENT, { detail: payload }))
  }
  ws.on('upgrade-progress', handler)
  return () => ws.off('upgrade-progress', handler)
}
