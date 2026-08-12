import { createRouter, createWebHashHistory } from 'vue-router'

import { installRouterNavigationGuards } from './navigation-leave'
import { migrationRoutes } from './routes'

export function createMigrationRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: migrationRoutes,
  })
  installRouterNavigationGuards(router)
  return router
}
