import { createRouter, createWebHashHistory } from 'vue-router'

import { installRouterNavigationGuards } from './navigation-leave'
import { appRoutes } from './routes'

export function createAppRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: appRoutes,
  })
  installRouterNavigationGuards(router)
  return router
}
