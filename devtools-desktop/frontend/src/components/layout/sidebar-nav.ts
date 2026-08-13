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

export interface SidebarNavGroupModel {
  id: string
  label: string
  items: SidebarNavItemModel[]
}

/** redesign-v2：侧栏分组目录（组序固定，组内项跟随用户菜单序） */
const NAV_GROUP_DEFS: ReadonlyArray<{ id: string; label: string; pages: readonly AppPageId[] }> = [
  { id: 'workbench', label: '工作台', pages: ['home', 'run', 'deploy'] },
  { id: 'files', label: '文件与终端', pages: ['filetransfer', 'editor', 'terminal'] },
  { id: 'records', label: '记录', pages: ['todo', 'notes', 'notebook'] },
  { id: 'tools', label: '工具', pages: ['ipcheck', 'twofa', 'usage'] },
  { id: 'system', label: '系统', pages: ['settings'] },
]

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

/** 分组视图：组序固定为设计定稿；组内项顺序继承用户菜单序；未归组页面兜底成「其它」组 */
export function resolveSidebarNavGroups(middleOrder?: unknown): SidebarNavGroupModel[] {
  const ordered = resolveSidebarNavItems(middleOrder)
  const grouped = new Set<string>()
  const groups: SidebarNavGroupModel[] = []
  for (const def of NAV_GROUP_DEFS) {
    const items = ordered.filter((item) => (def.pages as readonly string[]).includes(item.pageId))
    for (const item of items) grouped.add(item.pageId)
    if (items.length > 0) groups.push({ id: def.id, label: def.label, items })
  }
  const leftovers = ordered.filter((item) => !grouped.has(item.pageId))
  if (leftovers.length > 0) groups.push({ id: 'other', label: '其它', items: leftovers })
  return groups
}

export function isSidebarNavPage(pageId: string): pageId is AppPageId {
  return Boolean(getNavCatalogItem(pageId as AppPageId))
}
