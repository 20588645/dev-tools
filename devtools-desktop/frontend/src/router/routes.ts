import type { RouteRecordRaw } from 'vue-router'

// Phase 1 只建立类型边界；业务页面仍由旧应用壳切换，Phase 3 起逐页加入真实路由。
export const migrationRoutes: RouteRecordRaw[] = []
