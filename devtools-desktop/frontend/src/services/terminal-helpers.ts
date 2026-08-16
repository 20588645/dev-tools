/** 生成与 legacy 一致的终端会话 id：`term-` + base36 时间戳 + 短随机。 */
export function createTerminalSessionId(now = Date.now(), random = Math.random): string {
  return `term-${now.toString(36)}${random().toString(36).slice(2, 6)}`
}

/** 按命令名找标签（调试/兼容用）。运行态不要靠这个：软件重启后同名标签可能只是空壳。 */
export function tabIdForCommandName(
  tabs: ReadonlyArray<{ id: string; name: string }>,
  commandName: string,
): string | undefined {
  const name = commandName.trim()
  if (!name) return undefined
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    if (tabs[i]?.name === name) return tabs[i]?.id
  }
  return undefined
}

/** 命令跑起来时建的标签不应在软件重启后当成「仍在运行」。 */
export function partitionTerminalSessions<T extends { name: string }>(
  sessions: readonly T[],
  commandNames: readonly string[],
): { restore: T[]; staleCommandTabs: T[] } {
  const names = new Set(commandNames.map(item => item.trim()).filter(Boolean))
  const restore: T[] = []
  const staleCommandTabs: T[] = []
  for (const session of sessions) {
    if (names.has(session.name)) staleCommandTabs.push(session)
    else restore.push(session)
  }
  return { restore, staleCommandTabs }
}

/**
 * 读主题 CSS 变量：亮色表挂在 body[data-theme]，只读 html 会落到暗色 :root 默认值。
 */
export function readThemeCssVar(name: string, fallback = ''): string {
  try {
    const body = document.body
      ? getComputedStyle(document.body).getPropertyValue(name).trim()
      : ''
    if (body) return body
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

/**
 * 关标签后 sidecar 先 SIGTERM 再约 1.5s SIGKILL。
 * 重启要等旧进程（含后端隧道）让出端口，再开新壳。
 */
export const COMMAND_RESTART_WAIT_MS = 1_800
export const COMMAND_RESTART_INJECT_MS = 450

export interface ResizeDebouncer {
  schedule: () => void
  cancel: () => void
  flush: () => void
  /** 测试用：当前是否挂着待触发定时器 */
  pending: () => boolean
}

/**
 * 窗口 / 容器 resize 防抖：合并连续触发后再执行 fit + terminal-resize。
 * 放在纯函数模块便于单测，runtime 服务在真实监听里调用。
 */
export function createResizeDebouncer(callback: () => void, waitMs = 80): ResizeDebouncer {
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function flush() {
    cancel()
    callback()
  }

  function schedule() {
    cancel()
    timer = setTimeout(() => {
      timer = null
      callback()
    }, waitMs)
  }

  return {
    schedule,
    cancel,
    flush,
    pending: () => timer != null,
  }
}
