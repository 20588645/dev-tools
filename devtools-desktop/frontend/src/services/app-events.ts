import { realtimeWs } from '@/services/realtime'

/**
 * 应用级 window 事件契约（P9-8 自 legacy-bridge 收编）。
 * 这些事件解耦「设置页 / 常驻服务 / 页面」之间的跨域通知，
 * 名字保留 `devtools:` 前缀以兼容既有监听方。
 */

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

export function requestHomeRefresh(reason: HomeRefreshRequestDetail['reason'] = 'manual') {
  window.dispatchEvent(new CustomEvent<HomeRefreshRequestDetail>(HOME_REFRESH_REQUESTED_EVENT, {
    detail: { reason },
  }))
}

/**
 * WS `upgrade-progress` → window 事件桥。
 * 设置页的升级进度对话框监听 `UPGRADE_PROGRESS_EVENT`，与 WS 解耦；
 * 经共享实时连接（`services/realtime.ts`）订阅。
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
