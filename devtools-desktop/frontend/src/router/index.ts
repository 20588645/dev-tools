import { createRouter, createWebHashHistory } from 'vue-router'

import { migrationRoutes } from './routes'

export function createMigrationRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: migrationRoutes,
  })
}
