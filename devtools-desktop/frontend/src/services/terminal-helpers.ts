/** 生成与 legacy 一致的终端会话 id：`term-` + base36 时间戳 + 短随机。 */
export function createTerminalSessionId(now = Date.now(), random = Math.random): string {
  return `term-${now.toString(36)}${random().toString(36).slice(2, 6)}`
}

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
