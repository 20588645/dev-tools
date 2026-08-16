import {
  createTerminalSession,
  deleteTerminalSession,
  listTerminalSessions,
} from '@/services/modules/terminal-service'
import { realtimeWs } from '@/services/realtime'
import { createResizeDebouncer, createTerminalSessionId, COMMAND_RESTART_INJECT_MS, COMMAND_RESTART_WAIT_MS, partitionTerminalSessions, readThemeCssVar } from '@/services/terminal-helpers'
import { useNotificationStore } from '@/stores/notification'
import { useTerminalStore } from '@/stores/terminal'

/**
 * 应用级终端运行时：xterm + PTY WS 常驻 MigrationHost。
 *
 * 切走「快捷命令」页时 KeepAlive 会 deactivate TerminalView，但本服务不 dispose：
 * 同 WS 内 PTY 与每 tab 的 Terminal 实例继续存活；切回只 fit+focus。
 * 真正销毁发生在：关 tab、或 MigrationHost onBeforeUnmount → stop()。
 */

interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
}

interface XtermTerminal {
  cols: number
  rows: number
  options: { theme: XtermTheme }
  open: (parent: HTMLElement) => void
  focus: () => void
  write: (data: string) => void
  clear: () => void
  dispose: () => void
  loadAddon: (addon: unknown) => void
  onData: (cb: (data: string) => void) => { dispose: () => void }
}

interface FitAddonInstance {
  fit: () => void
  dispose?: () => void
}

interface SearchAddonInstance {
  findNext: (query: string, options?: Record<string, unknown>) => boolean
  findPrevious: (query: string, options?: Record<string, unknown>) => boolean
  clearDecorations: () => void
  dispose?: () => void
  onDidChangeResults: (cb: (results: { resultIndex: number; resultCount: number } | null) => void) => {
    dispose: () => void
  }
}

interface WebglAddonInstance {
  dispose: () => void
  onContextLoss: (cb: () => void) => void
}

interface LiveTab {
  id: string
  name: string
  term: XtermTerminal
  fitAddon: FitAddonInstance
  searchAddon: SearchAddonInstance
  webglAddon: WebglAddonInstance | null
  container: HTMLElement
  disposeData: () => void
  disposeSearchResults: () => void
  initialCwd: string
}

type TerminalCtor = new (options: Record<string, unknown>) => XtermTerminal
type FitCtor = new () => FitAddonInstance
type SearchCtor = new () => SearchAddonInstance
type WebglCtor = new () => WebglAddonInstance

interface XtermApis {
  Terminal: TerminalCtor
  FitAddon: FitCtor
  SearchAddon: SearchCtor
  WebglAddon: WebglCtor | null
}

let xtermApis: XtermApis | null = null

/**
 * 懒加载 xterm chunk（P9-6）：终端页挂载后的 `bootFromSessions` 触发，
 * xterm 及官方 CSS 随 `terminal-xterm-loader` 单独分包，不进主包。
 */
async function ensureXtermLoaded(): Promise<void> {
  if (xtermApis) return
  const mod = await import('@/services/terminal-xterm-loader')
  xtermApis = {
    Terminal: mod.Terminal as unknown as TerminalCtor,
    FitAddon: mod.FitAddon as unknown as FitCtor,
    SearchAddon: mod.SearchAddon as unknown as SearchCtor,
    WebglAddon: mod.WebglAddon as unknown as WebglCtor,
  }
}

function getXtermApis(): XtermApis {
  if (!xtermApis) throw new Error('xterm.js 或 addon 尚未加载')
  return xtermApis
}

function cssVar(name: string, fallback = ''): string {
  return readThemeCssVar(name, fallback)
}

function readXtermTheme(): XtermTheme {
  return {
    background: cssVar('--term-xterm-bg'),
    foreground: cssVar('--term-xterm-fg'),
    cursor: cssVar('--term-xterm-cursor'),
    selectionBackground: cssVar('--term-xterm-selection'),
    black: cssVar('--term-xterm-black'),
    red: cssVar('--term-xterm-red'),
    green: cssVar('--term-xterm-green'),
    yellow: cssVar('--term-xterm-yellow'),
    blue: cssVar('--term-xterm-blue'),
    magenta: cssVar('--term-xterm-magenta'),
    cyan: cssVar('--term-xterm-cyan'),
    white: cssVar('--term-xterm-white'),
  }
}

function readSearchDecorations(): Record<string, string> {
  return {
    activeMatchBackground: cssVar('--term-search-active-bg'),
    activeMatchBorder: cssVar('--term-search-active-border'),
    matchBackground: cssVar('--term-search-match-bg'),
    matchBorder: cssVar('--term-search-match-border'),
  }
}

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

let activeRuntime: ReturnType<typeof buildRuntime> | null = null

function buildRuntime() {
  const store = useTerminalStore()
  const notify = useNotificationStore()
  const live = new Map<string, LiveTab>()
  /** tabId → 命令名：只记录本次 Sidecar 会话里注入过、且 PTY 还没退出的快捷命令。 */
  const liveCommandRuns = new Map<string, string>()
  const restartingTabs = new Set<string>()
  let hostEl: HTMLElement | null = null
  let pageActive = false
  let started = false
  let booting: Promise<void> | null = null
  let themeObserver: MutationObserver | null = null

  const resizeDebouncer = createResizeDebouncer(() => {
    fitAndNotifyResize()
  }, 80)

  function syncStoreTabs() {
    store.setTabs(
      [...live.values()].map((t) => ({ id: t.id, name: t.name })),
      store.activeTabId && live.has(store.activeTabId)
        ? store.activeTabId
        : ([...live.keys()][0] ?? null),
    )
  }

  function syncRunningCommands() {
    const running: Record<string, string> = {}
    for (const [tabId, commandName] of liveCommandRuns) {
      const cmd = store.commands.find(item => item.name === commandName)
      if (cmd) running[cmd.id] = tabId
    }
    store.setRunningByCommandId(running)
  }

  function markCommandRunning(tabId: string, commandName: string) {
    const name = commandName.trim()
    if (!name) return
    liveCommandRuns.set(tabId, name)
    syncRunningCommands()
  }

  function clearCommandRunning(tabId: string) {
    if (!liveCommandRuns.delete(tabId)) return
    syncRunningCommands()
  }

  function sendWs(type: string, data: Record<string, unknown>) {
    const ws = realtimeWs()
    if (ws?.send?.(type, data)) {
      store.setConnectionStatus('connected')
    } else {
      store.setConnectionStatus('disconnected')
    }
  }

  function fitAndNotifyResize() {
    const id = store.activeTabId
    if (!id) return
    const tab = live.get(id)
    if (!tab) return
    try {
      tab.fitAddon.fit()
      sendWs('terminal-resize', {
        terminalId: id,
        cols: tab.term.cols,
        rows: tab.term.rows,
      })
    } catch {
      /* ignore fit errors while hidden */
    }
  }

  function applyThemeToAll() {
    const theme = readXtermTheme()
    for (const tab of live.values()) {
      tab.term.options.theme = { ...tab.term.options.theme, ...theme }
    }
  }

  function disposeLiveTab(tab: LiveTab) {
    try { tab.disposeSearchResults() } catch { /* ignore */ }
    try { tab.disposeData() } catch { /* ignore */ }
    if (tab.webglAddon) {
      try { tab.webglAddon.dispose() } catch { /* ignore */ }
    }
    try { tab.searchAddon.dispose?.() } catch { /* ignore */ }
    try { tab.fitAddon.dispose?.() } catch { /* ignore */ }
    try { tab.term.dispose() } catch { /* ignore */ }
    tab.container.remove()
  }

  function createLiveTab(opts: {
    tabId?: string
    name?: string
    initialCwd?: string
    persist?: boolean
    announceWebgl?: boolean
  } = {}): LiveTab | null {
    if (!hostEl) return null
    const { Terminal, FitAddon, SearchAddon, WebglAddon } = getXtermApis()
    const finalTabId = opts.tabId || createTerminalSessionId()
    if (live.has(finalTabId)) return live.get(finalTabId) ?? null

    const tabWrapper = document.createElement('div')
    tabWrapper.className = 'term-instance-wrapper'
    tabWrapper.dataset.terminalId = finalTabId
    tabWrapper.style.width = '100%'
    tabWrapper.style.height = '100%'
    tabWrapper.style.display = 'none'
    hostEl.appendChild(tabWrapper)

    const term = new Terminal({
      cursorBlink: true,
      allowProposedApi: true,
      fontFamily: '"SF Mono", Menlo, Monaco, Consolas, "JetBrains Mono", monospace',
      fontSize: 12,
      theme: readXtermTheme(),
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)

    const disposeSearchResults = searchAddon.onDidChangeResults((results) => {
      if (store.activeTabId !== finalTabId) return
      if (results && results.resultCount > 0) {
        store.setSearchCountLabel(`${results.resultIndex + 1}/${results.resultCount}`)
      } else {
        store.setSearchCountLabel('0/0')
      }
    }).dispose

    term.open(tabWrapper)
    const disposeData = term.onData((data) => {
      sendWs('terminal-input', { terminalId: finalTabId, data })
    }).dispose

    const newTabNumber = live.size + 1
    const finalName = opts.name || `Terminal ${newTabNumber}`
    let webglAddon: WebglAddonInstance | null = null

    if (WebglAddon) {
      try {
        const webgl = new WebglAddon()
        term.loadAddon(webgl)
        webgl.onContextLoss(() => {
          try { webgl.dispose() } catch { /* ignore */ }
          webglAddon = null
          const liveTab = live.get(finalTabId)
          if (liveTab) liveTab.webglAddon = null
          notify.push('WebGL 降级：WebGL context 丢失，已回退至 2D 渲染器', 'warning')
        })
        webglAddon = webgl
        if (opts.announceWebgl !== false && opts.persist !== false && !opts.tabId) {
          notify.push(`已启用 WebGL 终端硬件加速（${finalName}）`, 'success')
        }
      } catch {
        if (opts.announceWebgl !== false && !opts.tabId) {
          notify.push(`WebGL 不支持，已回退至 2D 渲染（${finalName}）`, 'info')
        }
      }
    }

    const tab: LiveTab = {
      id: finalTabId,
      name: finalName,
      term,
      fitAddon,
      searchAddon,
      webglAddon,
      container: tabWrapper,
      disposeData,
      disposeSearchResults,
      initialCwd: opts.initialCwd || '',
    }
    live.set(finalTabId, tab)
    syncStoreTabs()

    if (opts.persist !== false && !opts.tabId) {
      void createTerminalSession({
        id: finalTabId,
        name: finalName,
        cwd: opts.initialCwd || '',
      }).catch(() => {
        /* persist best-effort */
      })
    }

    switchTab(finalTabId)
    globalThis.setTimeout(() => {
      try {
        fitAddon.fit()
        sendWs('terminal-init', {
          terminalId: finalTabId,
          cols: term.cols,
          rows: term.rows,
          cwd: opts.initialCwd || '',
        })
      } catch {
        /* ignore */
      }
    }, 100)

    return tab
  }

  function switchTab(tabId: string) {
    if (!live.has(tabId)) return
    store.setActiveTabId(tabId)
    for (const tab of live.values()) {
      tab.container.style.display = tab.id === tabId ? 'block' : 'none'
    }
    globalThis.setTimeout(() => {
      const active = live.get(tabId)
      if (!active) return
      try {
        active.fitAddon.fit()
        active.term.focus()
      } catch {
        /* ignore */
      }
    }, 30)
    store.setConnectionStatus('connected')
  }

  function closeTab(tabId: string) {
    const tab = live.get(tabId)
    if (!tab) return
    const order = [...live.keys()]
    const tabIndex = order.indexOf(tabId)

    sendWs('terminal-close', { terminalId: tabId })
    void deleteTerminalSession(tabId).catch(() => { /* ignore */ })
    clearCommandRunning(tabId)
    restartingTabs.delete(tabId)
    disposeLiveTab(tab)
    live.delete(tabId)

    if (live.size === 0) {
      store.setActiveTabId(null)
      syncStoreTabs()
      createLiveTab()
      return
    }

    if (store.activeTabId === tabId) {
      const nextIndex = Math.min(tabIndex, live.size - 1)
      const nextId = [...live.keys()][nextIndex]
      syncStoreTabs()
      if (nextId) switchTab(nextId)
    } else {
      syncStoreTabs()
    }
  }

  async function bootFromSessions() {
    if (!hostEl) return
    if (live.size > 0) {
      onPageActivate()
      return
    }
    if (booting) {
      await booting
      return
    }
    await ensureXtermLoaded()
    booting = (async () => {
      try {
        if (store.commands.length === 0) await store.loadCommands()
        const sessions = await listTerminalSessions()
        const commandNames = store.commands.map(item => item.name)
        const { restore, staleCommandTabs } = partitionTerminalSessions(sessions, commandNames)
        for (const stale of staleCommandTabs) {
          void deleteTerminalSession(stale.id).catch(() => { /* ignore */ })
        }
        if (restore.length > 0) {
          for (const s of restore) {
            createLiveTab({
              tabId: s.id,
              name: s.name,
              initialCwd: s.cwd,
              persist: false,
              announceWebgl: false,
            })
          }
        } else {
          createLiveTab()
        }
      } catch {
        createLiveTab()
      } finally {
        store.sessionsBooted = true
        booting = null
      }
    })()
    await booting
  }

  function onPageActivate() {
    pageActive = true
    globalThis.setTimeout(() => {
      const id = store.activeTabId
      if (!id) return
      const tab = live.get(id)
      if (!tab) return
      try {
        tab.fitAddon.fit()
        tab.term.focus()
      } catch {
        /* ignore */
      }
    }, 50)
  }

  function onPageDeactivate() {
    pageActive = false
  }

  function setHost(el: HTMLElement | null) {
    hostEl = el
    if (!el) return
    // KeepAlive 再激活时，把已有 wrapper 挂回新/同一 host
    for (const tab of live.values()) {
      if (tab.container.parentElement !== el) {
        el.appendChild(tab.container)
      }
    }
  }

  function clearActiveScreen() {
    const id = store.activeTabId
    if (!id) return
    const tab = live.get(id)
    if (!tab) return
    tab.term.clear()
    sendWs('terminal-input', { terminalId: id, data: 'clear\r' })
  }

  function resetActiveShell() {
    const id = store.activeTabId
    if (!id) return
    const tab = live.get(id)
    if (!tab) return
    clearCommandRunning(id)
    tab.term.clear()
    tab.term.write('\x1b[33mReconnecting and spawning new shell...\x1b[0m\r\n')
    sendWs('terminal-init', {
      terminalId: id,
      cols: tab.term.cols,
      rows: tab.term.rows,
      cwd: '',
    })
    store.setConnectionStatus('connected')
  }

  function injectCommand(command: string, terminalId?: string) {
    const id = terminalId || store.activeTabId
    if (!id || !realtimeWs()?.connected) {
      notify.push('终端未连接或未就绪', 'warning')
      return false
    }
    if (!live.has(id)) {
      notify.push('目标终端不存在', 'warning')
      return false
    }
    sendWs('terminal-input', { terminalId: id, data: `${command}\r` })
    return true
  }

  /**
   * 快捷命令执行：始终新开一个 tab，避免打进正在跑长任务的当前终端。
   * 登录壳需要短暂就绪窗口，故在 terminal-init 后再延迟注入。
   */
  function runCommandInNewTab(command: string, tabName?: string) {
    if (!realtimeWs()?.connected) {
      notify.push('终端未连接或未就绪', 'warning')
      return false
    }
    const name = (tabName || '').trim() || undefined
    const tab = createLiveTab({
      name,
      announceWebgl: false,
      persist: false,
    })
    if (!tab) {
      notify.push('无法创建新终端', 'warning')
      return false
    }
    const targetId = tab.id
    if (name) markCommandRunning(targetId, name)
    // createLiveTab 约 100ms 后发 terminal-init；再留一点时间给登录提示符
    globalThis.setTimeout(() => {
      if (!live.has(targetId)) return
      injectCommand(command, targetId)
      const active = live.get(targetId)
      try { active?.term.focus() } catch { /* ignore */ }
    }, COMMAND_RESTART_INJECT_MS)
    return true
  }

  /**
   * 停掉该标签里的进程树（含后端隧道），再在同一标签里重新执行命令。
   */
  function restartCommandInTab(tabId: string, command: string, commandName?: string, onSettled?: () => void) {
    const tab = live.get(tabId)
    if (!tab || !realtimeWs()?.connected) {
      notify.push('终端未连接或未就绪', 'warning')
      onSettled?.()
      return false
    }
    switchTab(tabId)
    restartingTabs.add(tabId)
    if (commandName) markCommandRunning(tabId, commandName)
    tab.term.write('\r\n\x1b[33m正在停止当前进程并重启…\x1b[0m\r\n')
    sendWs('terminal-close', { terminalId: tabId })
    store.setConnectionStatus('disconnected')

    globalThis.setTimeout(() => {
      const current = live.get(tabId)
      if (!current || !realtimeWs()?.connected) {
        restartingTabs.delete(tabId)
        onSettled?.()
        return
      }
      current.term.write('\x1b[33m正在重新启动…\x1b[0m\r\n')
      sendWs('terminal-init', {
        terminalId: tabId,
        cols: current.term.cols,
        rows: current.term.rows,
        cwd: '',
      })
      store.setConnectionStatus('connected')
      globalThis.setTimeout(() => {
        if (live.has(tabId)) {
          injectCommand(command, tabId)
          if (commandName) markCommandRunning(tabId, commandName)
        }
        restartingTabs.delete(tabId)
        onSettled?.()
      }, COMMAND_RESTART_INJECT_MS)
    }, COMMAND_RESTART_WAIT_MS)
    return true
  }

  function performSearch(direction: 'next' | 'prev', incremental = false) {
    const id = store.activeTabId
    if (!id) return
    const tab = live.get(id)
    if (!tab) return
    const query = store.searchQuery
    if (!query) {
      store.setSearchCountLabel('0/0')
      try { tab.searchAddon.clearDecorations() } catch { /* ignore */ }
      return
    }
    const options = {
      incremental,
      caseSensitive: false,
      decorations: readSearchDecorations(),
    }
    try {
      if (direction === 'next') tab.searchAddon.findNext(query, options)
      else tab.searchAddon.findPrevious(query, options)
    } catch {
      /* ignore */
    }
  }

  function closeSearch() {
    store.setSearchOpen(false)
    const id = store.activeTabId
    if (!id) return
    const tab = live.get(id)
    if (!tab) return
    try { tab.searchAddon.clearDecorations() } catch { /* ignore */ }
    try { tab.term.focus() } catch { /* ignore */ }
  }

  function handleOutput(payload: unknown) {
    const row = asPayload(payload)
    const terminalId = typeof row.terminalId === 'string' ? row.terminalId : ''
    const data = typeof row.data === 'string' ? row.data : ''
    const tab = live.get(terminalId)
    if (tab && data) tab.term.write(data)
  }

  function handleExit(payload: unknown) {
    const row = asPayload(payload)
    const terminalId = typeof row.terminalId === 'string' ? row.terminalId : ''
    const exitCode = Number(row.exitCode ?? 0)
    const tab = live.get(terminalId)
    if (tab) {
      tab.term.write(`\r\n\r\n\x1b[31mSession closed (exit code: ${exitCode || 0})\x1b[0m\r\n`)
    }
    if (!restartingTabs.has(terminalId)) clearCommandRunning(terminalId)
    if (terminalId === store.activeTabId) {
      store.setConnectionStatus('disconnected')
    }
  }

  function handleWsOpen() {
    // 重连后对各 tab 再 init：新 shell，不恢复旧进程
    liveCommandRuns.clear()
    syncRunningCommands()
    for (const tab of live.values()) {
      sendWs('terminal-init', {
        terminalId: tab.id,
        cols: tab.term.cols,
        rows: tab.term.rows,
        cwd: '',
      })
    }
    store.setConnectionStatus('connected')
  }

  function onWindowResize() {
    if (!pageActive) return
    resizeDebouncer.schedule()
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (!pageActive) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
      e.preventDefault()
      createLiveTab()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      if (store.fullscreen) {
        e.preventDefault()
        store.setSearchOpen(true)
      }
      return
    }
    if (e.key === 'Escape' && store.fullscreen) {
      if (store.searchOpen) {
        e.preventDefault()
        closeSearch()
      } else {
        e.preventDefault()
        store.setFullscreen(false)
        globalThis.setTimeout(() => resizeDebouncer.flush(), 100)
      }
    }
  }

  function start() {
    if (started) return
    started = true
    const ws = realtimeWs()
    ws?.on('terminal-output', handleOutput)
    ws?.on('terminal-exit', handleExit)
    ws?.on('open', handleWsOpen)
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('keydown', onGlobalKeydown)
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') applyThemeToAll()
      }
    })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })
  }

  function stop() {
    if (!started) return
    started = false
    pageActive = false
    resizeDebouncer.cancel()
    const ws = realtimeWs()
    ws?.off('terminal-output', handleOutput)
    ws?.off('terminal-exit', handleExit)
    ws?.off('open', handleWsOpen)
    window.removeEventListener('resize', onWindowResize)
    window.removeEventListener('keydown', onGlobalKeydown)
    themeObserver?.disconnect()
    themeObserver = null
    for (const tab of [...live.values()]) {
      sendWs('terminal-close', { terminalId: tab.id })
      disposeLiveTab(tab)
    }
    live.clear()
    liveCommandRuns.clear()
    restartingTabs.clear()
    store.setRunningByCommandId({})
    store.setTabs([], null)
    store.sessionsBooted = false
    hostEl = null
  }

  return {
    start,
    stop,
    setHost,
    bootFromSessions,
    onPageActivate,
    onPageDeactivate,
    createTab: () => { createLiveTab() },
    switchTab,
    closeTab,
    clearActiveScreen,
    resetActiveShell,
    injectCommand,
    runCommandInNewTab,
    restartCommandInTab,
    performSearch,
    closeSearch,
    scheduleResize: () => resizeDebouncer.schedule(),
    flushResize: () => resizeDebouncer.flush(),
  }
}

export function createTerminalRuntimeService() {
  const runtime = buildRuntime()
  return {
    start() {
      activeRuntime = runtime
      runtime.start()
    },
    stop() {
      runtime.stop()
      if (activeRuntime === runtime) activeRuntime = null
    },
  }
}

export function getTerminalRuntime() {
  return activeRuntime
}
