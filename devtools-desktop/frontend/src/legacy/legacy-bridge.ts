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

export interface LegacyPageActivationDetail {
  pageId: LegacyPageId
  source: 'legacy' | 'vue'
}

export const LEGACY_PAGE_ACTIVATED_EVENT = 'devtools:legacy-page-activated'
export const LEGACY_SUBTAB_ACTIVATED_EVENT = 'devtools:legacy-subtab-activated'
export const LEGACY_PAGE_REQUESTED_EVENT = 'devtools:legacy-page-requested'
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

export function emitLegacyPageActivation(detail: LegacyPageActivationDetail) {
  window.dispatchEvent(new CustomEvent<LegacyPageActivationDetail>(LEGACY_PAGE_ACTIVATED_EVENT, { detail }))
}

export function requestLegacyPage(pageId: LegacyPageId) {
  window.dispatchEvent(new CustomEvent<LegacyPageActivationDetail>(LEGACY_PAGE_REQUESTED_EVENT, {
    detail: { pageId, source: 'vue' },
  }))
}

export function onLegacyPageActivation(listener: (detail: LegacyPageActivationDetail) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<LegacyPageActivationDetail>).detail)
  window.addEventListener(LEGACY_PAGE_ACTIVATED_EVENT, handler)
  return () => window.removeEventListener(LEGACY_PAGE_ACTIVATED_EVENT, handler)
}

/**
 * 部署面板的子页切换。部署面板按子页逐个迁移，Vue 侧需要知道当前是哪个子页
 * 才能只挂载已迁移的那个；三个子页全部迁完后这套桥接随 `switchSubTab` 一起删。
 */
export function onLegacySubTabActivation(listener: (sub: string) => void) {
  const handler = (event: Event) => listener(String((event as CustomEvent<{ sub: string }>).detail?.sub ?? ''))
  window.addEventListener(LEGACY_SUBTAB_ACTIVATED_EVENT, handler)
  return () => window.removeEventListener(LEGACY_SUBTAB_ACTIVATED_EVENT, handler)
}

export function requestHomeRefresh(reason: HomeRefreshRequestDetail['reason'] = 'manual') {
  window.dispatchEvent(new CustomEvent<HomeRefreshRequestDetail>(HOME_REFRESH_REQUESTED_EVENT, {
    detail: { reason },
  }))
}
