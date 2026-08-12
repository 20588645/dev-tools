import type { AppPageId } from '@/router/page-contract'

/**
 * 路由 meta：侧栏与离开策略的单一数据源（P8-1+；P8-5 后可见侧栏由 AppSidebar 消费）。
 */
export type NavFixed = 'first' | 'last'

/** 离开页策略：confirm = 需用户确认；none = 不拦截 */
export type LeavePolicy = 'confirm' | 'none'

/**
 * keepSession：切走路由时业务会话是否应继续（与 KeepAlive/应用级 runtime 配合）。
 * - true：PTY / SFTP 等，离开 UI 不杀后台
 * - false：无跨页会话（默认）
 */
export interface AppRouteMeta {
  pageId: AppPageId
  title: string
  /** 与 app.js SIDEBAR_MENU_ITEMS 对齐的排序键；home/settings 用 fixed */
  menuKey: string
  fixed?: NavFixed
  /** 组件 defineOptions name，供 KeepAlive include */
  keepAliveName: string
  leavePolicy: LeavePolicy
  keepSession: boolean
  /** deploy 子页 */
  deploySub?: 'dashboard' | 'servers' | 'history'
  /** 是否出现在主导航（deploy 子路由 false） */
  showInNav?: boolean
}

declare module 'vue-router' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 声明合并：把项目字段注入 vue-router 的 RouteMeta
  interface RouteMeta extends Partial<AppRouteMeta> {}
}

export interface NavCatalogItem {
  pageId: AppPageId
  title: string
  menuKey: string
  fixed?: NavFixed
  keepAliveName: string
  leavePolicy: LeavePolicy
  keepSession: boolean
  path: string
  /** 动态 import 工厂名（仅文档/测试对照） */
  view: string
}

/** 与 `app.js` DEFAULT_MENU_ORDER 一致（不含固定首尾）；菜单序单一默认源（P8-4） */
export const DEFAULT_MENU_ORDER = [
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
] as const

export type SortableMenuPage = (typeof DEFAULT_MENU_ORDER)[number]

/**
 * 主导航目录（一页一条）。deploy 在导航上只占一项，子页走 children。
 */
export const NAV_CATALOG: readonly NavCatalogItem[] = [
  {
    pageId: 'home',
    title: '应用首页',
    menuKey: 'home',
    fixed: 'first',
    keepAliveName: 'HomeView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/',
    view: 'home/HomeView.vue',
  },
  {
    pageId: 'run',
    title: '本地运行',
    menuKey: 'run',
    keepAliveName: 'RunView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/run',
    view: 'run/RunView.vue',
  },
  {
    pageId: 'deploy',
    title: '部署面板',
    menuKey: 'deploy',
    keepAliveName: 'DeployDashboardView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/deploy',
    view: 'deploy/DeployDashboardView.vue',
  },
  {
    pageId: 'filetransfer',
    title: '文件传输',
    menuKey: 'filetransfer',
    keepAliveName: 'FileTransferView',
    leavePolicy: 'none',
    keepSession: true,
    path: '/filetransfer',
    view: 'filetransfer/FileTransferView.vue',
  },
  {
    pageId: 'terminal',
    title: '快捷命令',
    menuKey: 'terminal',
    keepAliveName: 'TerminalView',
    leavePolicy: 'none',
    keepSession: true,
    path: '/terminal',
    view: 'terminal/TerminalView.vue',
  },
  {
    pageId: 'todo',
    title: '待办事项',
    menuKey: 'todo',
    keepAliveName: 'TodoView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/todo',
    view: 'todo/TodoView.vue',
  },
  {
    pageId: 'notes',
    title: '工时内容',
    menuKey: 'notes',
    keepAliveName: 'NotesView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/notes',
    view: 'notes/NotesView.vue',
  },
  {
    pageId: 'notebook',
    title: '个人笔记',
    menuKey: 'notebook',
    keepAliveName: 'NotebookView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/notebook',
    view: 'notebook/NotebookView.vue',
  },
  {
    pageId: 'editor',
    title: '文件编辑',
    menuKey: 'editor',
    keepAliveName: 'FileEditorView',
    leavePolicy: 'confirm',
    keepSession: false,
    path: '/editor',
    view: 'editor/FileEditorView.vue',
  },
  {
    pageId: 'ipcheck',
    title: '纯净检测',
    menuKey: 'ipcheck',
    keepAliveName: 'IpCheckView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/ipcheck',
    view: 'ipcheck/IpCheckView.vue',
  },
  {
    pageId: 'twofa',
    title: '双因验证',
    menuKey: 'twofa',
    keepAliveName: 'TwofaView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/twofa',
    view: 'twofa/TwofaView.vue',
  },
  {
    pageId: 'usage',
    title: '用量统计',
    menuKey: 'usage',
    keepAliveName: 'UsageView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/usage',
    view: 'usage/UsageView.vue',
  },
  {
    pageId: 'settings',
    title: '系统设置',
    menuKey: 'settings',
    fixed: 'last',
    keepAliveName: 'SettingsView',
    leavePolicy: 'none',
    keepSession: false,
    path: '/settings',
    view: 'settings/SettingsView.vue',
  },
] as const

const NAV_BY_PAGE = new Map(NAV_CATALOG.map((item) => [item.pageId, item]))

export function getNavCatalogItem(pageId: AppPageId): NavCatalogItem | undefined {
  return NAV_BY_PAGE.get(pageId)
}

/** 解析设置里保存的中间段顺序；非法项丢弃，缺省补 DEFAULT_MENU_ORDER */
export function normalizeMenuOrder(raw: unknown): SortableMenuPage[] {
  const allowed = new Set<string>(DEFAULT_MENU_ORDER)
  const seen = new Set<SortableMenuPage>()
  const out: SortableMenuPage[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'string') continue
      if (!allowed.has(item) || seen.has(item as SortableMenuPage)) continue
      const page = item as SortableMenuPage
      seen.add(page)
      out.push(page)
    }
  }
  for (const page of DEFAULT_MENU_ORDER) {
    if (!seen.has(page)) out.push(page)
  }
  return out
}

/** 完整侧栏顺序：home + 中间可排序 + settings */
export function buildSidebarOrder(middleOrder?: unknown): AppPageId[] {
  return ['home', ...normalizeMenuOrder(middleOrder), 'settings']
}

export function keepAliveNamesFromCatalog(): string[] {
  const names = new Set<string>(NAV_CATALOG.map((item) => item.keepAliveName))
  names.add('DeployServersView')
  names.add('DeployHistoryView')
  return [...names]
}
