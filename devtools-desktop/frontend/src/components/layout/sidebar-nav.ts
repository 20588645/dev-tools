import type { AppPageId } from '@/router/page-contract'
import {
  buildSidebarOrder,
  getNavCatalogItem,
  type NavCatalogItem,
} from '@/router/route-meta'

import { getNavIconSvg } from './nav-icons'

export interface SidebarNavItemModel extends NavCatalogItem {
  iconSvg: string
}

/** 按菜单序组装侧栏项（含 SVG）；供 AppSidebar / 单测共用 */
export function resolveSidebarNavItems(middleOrder?: unknown): SidebarNavItemModel[] {
  const items: SidebarNavItemModel[] = []
  for (const pageId of buildSidebarOrder(middleOrder)) {
    const catalog = getNavCatalogItem(pageId)
    if (!catalog) continue
    items.push({
      ...catalog,
      iconSvg: getNavIconSvg(pageId),
    })
  }
  return items
}

export function isSidebarNavPage(pageId: string): pageId is AppPageId {
  return Boolean(getNavCatalogItem(pageId as AppPageId))
}
