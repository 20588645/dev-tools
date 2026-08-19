import type { RouteMeta, RouteRecordRaw } from 'vue-router'

import { NAV_CATALOG, type AppRouteMeta } from './route-meta'

function metaOf(pageId: AppRouteMeta['pageId'], patch: Partial<AppRouteMeta> = {}): RouteMeta {
  const base = NAV_CATALOG.find((item) => item.pageId === pageId)
  if (!base) throw new Error(`unknown pageId: ${pageId}`)
  return {
    pageId: base.pageId,
    title: base.title,
    menuKey: base.menuKey,
    fixed: base.fixed,
    keepAliveName: base.keepAliveName,
    leavePolicy: base.leavePolicy,
    keepSession: base.keepSession,
    showInNav: true,
    ...patch,
  }
}

/**
 * 业务路由。deploy 子页用扁平路径（非嵌套 RouterView），便于单层 `<RouterView>` + KeepAlive。
 */
export const appRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home/HomeView.vue'),
    meta: metaOf('home'),
  },
  {
    path: '/run',
    name: 'run',
    component: () => import('@/views/run/RunView.vue'),
    meta: metaOf('run'),
  },
  {
    path: '/deploy',
    name: 'deploy',
    redirect: { name: 'deploy-dashboard' },
    meta: metaOf('deploy'),
  },
  {
    path: '/deploy/dashboard',
    name: 'deploy-dashboard',
    component: () => import('@/views/deploy/DeployDashboardView.vue'),
    meta: metaOf('deploy', {
      keepAliveName: 'DeployDashboardView',
      deploySub: 'dashboard',
      showInNav: false,
      title: '部署面板 · 项目总览',
    }),
  },
  {
    path: '/deploy/servers',
    name: 'deploy-servers',
    component: () => import('@/views/deploy/DeployServersView.vue'),
    meta: metaOf('deploy', {
      keepAliveName: 'DeployServersView',
      deploySub: 'servers',
      showInNav: false,
      title: '部署面板 · 服务器管理',
    }),
  },
  {
    path: '/deploy/history',
    name: 'deploy-history',
    component: () => import('@/views/deploy/DeployHistoryView.vue'),
    meta: metaOf('deploy', {
      keepAliveName: 'DeployHistoryView',
      deploySub: 'history',
      showInNav: false,
      title: '部署面板 · 部署历史',
    }),
  },
  {
    path: '/filetransfer',
    name: 'filetransfer',
    component: () => import('@/views/filetransfer/FileTransferView.vue'),
    meta: metaOf('filetransfer'),
  },
  {
    path: '/terminal',
    name: 'terminal',
    component: () => import('@/views/terminal/TerminalView.vue'),
    meta: metaOf('terminal'),
  },
  {
    path: '/todo',
    name: 'todo',
    component: () => import('@/views/todo/TodoView.vue'),
    meta: metaOf('todo'),
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/views/notes/NotesView.vue'),
    meta: metaOf('notes'),
  },
  {
    path: '/notebook',
    name: 'notebook',
    component: () => import('@/views/notebook/NotebookView.vue'),
    meta: metaOf('notebook'),
  },
  {
    path: '/editor',
    name: 'editor',
    component: () => import('@/views/editor/FileEditorView.vue'),
    meta: metaOf('editor'),
  },
  {
    path: '/ipcheck',
    name: 'ipcheck',
    component: () => import('@/views/ipcheck/IpCheckView.vue'),
    meta: metaOf('ipcheck'),
  },
  {
    path: '/twofa',
    name: 'twofa',
    component: () => import('@/views/twofa/TwofaView.vue'),
    meta: metaOf('twofa'),
  },
  {
    path: '/appfix',
    name: 'appfix',
    component: () => import('@/views/appfix/AppFixView.vue'),
    meta: metaOf('appfix'),
  },
  {
    path: '/usage',
    name: 'usage',
    component: () => import('@/views/usage/UsageView.vue'),
    meta: metaOf('usage'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: metaOf('settings'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
