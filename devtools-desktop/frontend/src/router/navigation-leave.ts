import type { Router, RouteLocationNormalized } from 'vue-router'

import {
  isAppPageId,
  runPageLeaveGuards,
  type AppPageId,
} from '@/router/page-contract'

import { NAV_CATALOG, type LeavePolicy } from './route-meta'

/**
 * Phase 8 P8-2：统一离开契约。
 *
 * - 运行时确认仍走 `registerPageLeaveGuard`（editor 脏标签）
 * - Router beforeEach 与页面注册的 guard 共用 `runPageLeaveGuards`
 * - meta.leavePolicy / keepSession 是声明；真正弹窗由页面注册的 guard 执行
 */

export interface LeaveContractRow {
  pageId: AppPageId
  leavePolicy: LeavePolicy
  keepSession: boolean
  note: string
}

export function listLeaveContract(): LeaveContractRow[] {
  return NAV_CATALOG.map((item) => ({
    pageId: item.pageId,
    leavePolicy: item.leavePolicy,
    keepSession: item.keepSession,
    note:
      item.leavePolicy === 'confirm'
        ? '离开前运行 registerPageLeaveGuard（编辑器脏标签）'
        : item.keepSession
          ? '切走 UI 不杀后台会话（SFTP / PTY runtime 常驻）'
          : '无离开确认；无跨页会话',
  }))
}

export function pageIdFromRoute(route: RouteLocationNormalized): AppPageId | null {
  const raw = route.meta?.pageId
  return isAppPageId(raw) ? raw : null
}

/**
 * 是否需要跑离开守卫：跨 pageId 才跑。
 * deploy 子路径互切（dashboard↔servers）同为 pageId=deploy → 不跑。
 */
export function shouldRunLeaveGuard(
  from: RouteLocationNormalized,
  to: RouteLocationNormalized,
): AppPageId | null {
  const fromId = pageIdFromRoute(from)
  const toId = pageIdFromRoute(to)
  if (!fromId) return null
  if (fromId === toId) return null
  return fromId
}

export async function confirmLeavePage(pageId: AppPageId): Promise<boolean> {
  return runPageLeaveGuards(pageId)
}

/**
 * 挂到 createMigrationRouter：P8-5 cutover 后正式生效。
 * P8-2 先接线并单测；main 仍未 use(router)，不影响当前壳。
 */
export function installRouterNavigationGuards(router: Router): () => void {
  return router.beforeEach(async (to, from) => {
    // 首屏 / 同地址
    if (!from.matched.length) return true
    if (from.fullPath === to.fullPath) return true

    const leaving = shouldRunLeaveGuard(from, to)
    if (!leaving) return true

    const ok = await confirmLeavePage(leaving)
    return ok
  })
}
