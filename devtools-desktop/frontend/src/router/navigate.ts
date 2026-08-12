import type { Router } from 'vue-router'

import { getNavCatalogItem } from '@/router/route-meta'

let appRouter: Router | null = null

/** main.ts 在 createMigrationRouter 后调用一次 */
export function setAppRouter(router: Router) {
  appRouter = router
}

export function getAppRouter(): Router | null {
  return appRouter
}

/** 应用内跳转：读 NAV_CATALOG.path，单一权威走 Vue Router */
export function navigateToPage(pageId: string) {
  const item = getNavCatalogItem(pageId as never)
  const path = item?.path ?? '/'
  if (appRouter) return appRouter.push(path)
  window.location.hash = path === '/' ? '#/' : `#${path}`
  return Promise.resolve()
}
