/**
 * 应用页面契约（P9-8 自 legacy-bridge 收编更名）：
 * 14 个页面 id 是路由、侧栏、KeepAlive 与 E2E 的共同契约；
 * 离开守卫供 Router beforeEach 与页面（editor 脏确认）注册使用。
 */

export const APP_PAGE_IDS = [
  'home',
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
  'appfix',
  'usage',
  'settings',
] as const

export type AppPageId = typeof APP_PAGE_IDS[number]

export function isAppPageId(value: unknown): value is AppPageId {
  return typeof value === 'string' && APP_PAGE_IDS.includes(value as AppPageId)
}

/**
 * 页面离开守卫：Router beforeEach 与 registerPageLeaveGuard（editor 脏确认）共用。
 */
export type PageLeaveGuard = () => boolean | Promise<boolean>

const pageLeaveGuards = new Map<AppPageId, PageLeaveGuard>()

export function registerPageLeaveGuard(pageId: AppPageId, guard: PageLeaveGuard): () => void {
  pageLeaveGuards.set(pageId, guard)
  return () => {
    if (pageLeaveGuards.get(pageId) === guard) pageLeaveGuards.delete(pageId)
  }
}

export async function runPageLeaveGuards(pageId: string): Promise<boolean> {
  if (!isAppPageId(pageId)) return true
  const guard = pageLeaveGuards.get(pageId)
  if (!guard) return true
  try {
    return Boolean(await guard())
  } catch {
    return false
  }
}
