import { defineStore } from 'pinia'

import type { DeployServer } from '@/services/modules/deploy-service'
import { getServers } from '@/services/modules/deploy-service'
import { sendDesktopNotification } from '@/services/desktop-notification'
import {
  cancelTransfer,
  connectSftp,
  deleteLocal,
  deleteRemote,
  dirnamePosix,
  disconnectSftp,
  formatSize,
  joinLocal,
  joinPosix,
  listLocal,
  listRemote,
  mkdirLocal,
  mkdirRemote,
  renameLocal,
  renameRemote,
  startTransfer,
  type ConflictPolicy,
  type FtFileItem,
  type TransferDirection,
} from '@/services/modules/filetransfer-service'
import { useNotificationStore } from '@/stores/notification'
import { useSettingsStore } from '@/stores/settings'

export type FtSortKey = 'name' | 'size' | 'mtime'
export type FtSort = { key: FtSortKey; dir: 1 | -1 }
export type FtSide = 'local' | 'remote'
export type SessionStatusKind = 'idle' | 'connecting' | 'connected'
export type TransferState = 'queued' | 'transferring' | 'done' | 'failed' | 'cancelled'

export interface FtSuggestState {
  dir: string | null
  items: FtFileItem[]
  list: FtFileItem[]
  active: number
  open: boolean
}

export interface FtTab {
  id: number
  sessionId: string
  server: DeployServer
  path: string
  items: FtFileItem[]
  selected: string[]
  anchor: string | null
  sort: FtSort
  defaultPath: string
  sug: FtSuggestState
  loading: boolean
  error: string
}

export interface FtTransferTask {
  taskId: string
  direction: TransferDirection
  sessionId?: string
  serverName?: string
  state: TransferState
  filesTotal: number
  filesDone: number
  curName: string
  curPercent: number
  speed: number
  etaSec: number
  startedAt: number
  error?: string
  lastError?: string
}

export interface TransferEventPayload {
  taskId?: string
  direction?: TransferDirection
  phase?: string
  filesTotal?: number
  filesDone?: number
  name?: string
  percent?: number
  speed?: number
  etaSec?: number
  error?: string
}

const SORT_LOCAL_KEY = 'ft.localSort'
const SORT_REMOTE_KEY = 'ft.remoteSort'
const SPLIT_KEY = 'ft.splitRatio'

function emptySuggest(): FtSuggestState {
  return { dir: null, items: [], list: [], active: -1, open: false }
}

function loadSort(key: string): FtSort {
  try {
    const raw = JSON.parse(storageGet(key) || '')
    if (raw && typeof raw.key === 'string') {
      const sortKey: FtSortKey = raw.key === 'size' || raw.key === 'mtime' ? raw.key : 'name'
      return { key: sortKey, dir: raw.dir < 0 ? -1 : 1 }
    }
  } catch {
    /* ignore */
  }
  return { key: 'name', dir: 1 }
}

function loadSplitRatio(): number {
  const saved = Number.parseFloat(storageGet(SPLIT_KEY) || '')
  if (saved >= 0.2 && saved <= 0.8) return saved
  return 0.5
}

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function sortItems(items: FtFileItem[], sort: FtSort): FtFileItem[] {
  const dir = sort.dir < 0 ? -1 : 1
  return items.slice().sort((a, b) => {
    if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1
    let r = 0
    if (sort.key === 'size') r = (a.size || 0) - (b.size || 0)
    else if (sort.key === 'mtime') r = (a.mtime || 0) - (b.mtime || 0)
    else r = String(a.name).localeCompare(String(b.name), 'zh', { numeric: true, sensitivity: 'base' })
    return r * dir
  })
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function isSessionLostMessage(message: string): boolean {
  return /会话/.test(message)
}

let tabSeq = 0

export const useFileTransferStore = defineStore('file-transfer', {
  state: () => ({
    servers: [] as DeployServer[],
    selectedServerId: '',
    connecting: false,
    statusKind: 'idle' as SessionStatusKind,
    statusText: '未连接',
    tabs: [] as FtTab[],
    activeTabId: null as number | null,
    localPath: '',
    localParent: null as string | null,
    localHome: '',
    localItems: [] as FtFileItem[],
    localSelected: [] as string[],
    localAnchor: null as string | null,
    localSort: loadSort(SORT_LOCAL_KEY),
    localSug: emptySuggest(),
    localLoading: false,
    localError: '',
    conflictPolicy: 'overwrite' as ConflictPolicy,
    splitRatio: loadSplitRatio(),
    tasks: {} as Record<string, FtTransferTask>,
    serversLoaded: false,
  }),

  getters: {
    activeTab(state): FtTab | null {
      return state.tabs.find((t) => t.id === state.activeTabId) ?? null
    },
    sessionId(): string | null {
      return this.activeTab?.sessionId ?? null
    },
    currentServer(): DeployServer | null {
      return this.activeTab?.server ?? null
    },
    remotePath(): string {
      return this.activeTab?.path ?? ''
    },
    remoteItems(): FtFileItem[] {
      return this.activeTab?.items ?? []
    },
    remoteSelected(): string[] {
      return this.activeTab?.selected ?? []
    },
    remoteSort(): FtSort {
      return this.activeTab?.sort ?? loadSort(SORT_REMOTE_KEY)
    },
    remoteDefault(): string {
      return this.activeTab?.defaultPath ?? '.'
    },
    remoteLoading(): boolean {
      return this.activeTab?.loading ?? false
    },
    remoteError(): string {
      return this.activeTab?.error ?? ''
    },
    connected(): boolean {
      return Boolean(this.sessionId)
    },
    sortedLocalItems(): FtFileItem[] {
      return sortItems(this.localItems, this.localSort)
    },
    sortedRemoteItems(): FtFileItem[] {
      return sortItems(this.remoteItems, this.remoteSort)
    },
    taskList(): FtTransferTask[] {
      return Object.values(this.tasks).sort((a, b) => b.startedAt - a.startedAt)
    },
    hasFinishedTasks(): boolean {
      return this.taskList.some((t) => ['done', 'failed', 'cancelled'].includes(t.state))
    },
    hasActiveTasks(): boolean {
      return this.taskList.some((t) => t.state === 'queued' || t.state === 'transferring')
    },
    localStatusText(): string {
      return statusBarText(this.localItems, this.localSelected)
    },
    remoteStatusText(): string {
      return statusBarText(this.remoteItems, this.remoteSelected)
    },
  },

  actions: {
    notify(message: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info') {
      useNotificationStore().push(message, tone)
    },

    async loadServers(options: { force?: boolean } = {}) {
      if (this.serversLoaded && !options.force) return
      try {
        this.servers = await getServers()
        this.serversLoaded = true
        if (!this.selectedServerId && this.servers[0]) {
          this.selectedServerId = this.servers[0].id
        } else if (this.selectedServerId && !this.servers.some((s) => s.id === this.selectedServerId)) {
          this.selectedServerId = this.servers[0]?.id ?? ''
        }
      } catch (cause) {
        this.servers = []
        this.notify(`加载服务器列表失败：${errorMessage(cause, '稍后重试')}`, 'error')
      }
    },

    makeTab(sessionId: string, server: DeployServer): FtTab {
      tabSeq += 1
      return {
        id: tabSeq,
        sessionId,
        server,
        path: '',
        items: [],
        selected: [],
        anchor: null,
        sort: loadSort(SORT_REMOTE_KEY),
        defaultPath: server.defaultRemotePath || '.',
        sug: emptySuggest(),
        loading: false,
        error: '',
      }
    },

    /** 切 tab 前把活动镜像写回（状态已在 tab 内时为幂等）。 */
    saveActiveTab() {
      /* tab 自持状态；保留方法以对齐 legacy 镜像契约与单测入口。 */
    },

    loadTab(tab: FtTab) {
      this.activeTabId = tab.id
      this.syncStatusFromActive()
    },

    switchTab(id: number) {
      if (id === this.activeTabId) return
      const tab = this.tabs.find((t) => t.id === id)
      if (!tab) return
      this.saveActiveTab()
      this.loadTab(tab)
    },

    syncStatusFromActive() {
      const tab = this.activeTab
      if (tab) {
        this.statusKind = 'connected'
        this.statusText = `已连接 · ${tab.server.username || ''}@${tab.server.host || ''}`
        if (tab.server.id) this.selectedServerId = tab.server.id
      } else {
        this.statusKind = 'idle'
        this.statusText = '未连接'
      }
    },

    activateFallback(wasActive: boolean) {
      if (!wasActive) return
      if (this.tabs.length) {
        const next = this.tabs[this.tabs.length - 1]
        this.loadTab(next)
      } else {
        this.activeTabId = null
        this.syncStatusFromActive()
      }
    },

    async connect() {
      const serverId = this.selectedServerId
      if (!serverId) {
        this.notify('请先选择服务器', 'warning')
        return
      }
      const server = this.servers.find((s) => s.id === serverId)
      if (!server) {
        this.notify('请先选择服务器', 'warning')
        return
      }
      const exist = this.tabs.find((t) => t.server.id === serverId)
      if (exist) {
        this.switchTab(exist.id)
        this.notify(`已切到该连接：${server.name || server.host || ''}`, 'info')
        return
      }

      const hadActive = Boolean(this.activeTab)
      this.connecting = true
      this.statusKind = 'connecting'
      this.statusText = `连接中 · ${server.name || ''}`

      try {
        const settings = useSettingsStore()
        if (!settings.loaded) await settings.load().catch(() => undefined)
        const timeoutMs = settings.connectionTimeoutSec * 1000
        const { sessionId } = await connectSftp(serverId, timeoutMs)
        this.saveActiveTab()
        const tab = this.makeTab(sessionId, server)
        this.tabs.push(tab)
        this.loadTab(tab)
        this.notify(`已连接：${server.name || server.host}`, 'success')
        await this.loadRemote(tab.defaultPath)
      } catch (cause) {
        if (hadActive) this.syncStatusFromActive()
        else {
          this.statusKind = 'idle'
          this.statusText = '未连接'
        }
        this.notify(`连接失败：${errorMessage(cause, '未知错误')}`, 'error')
      } finally {
        this.connecting = false
      }
    },

    async closeTab(id: number) {
      const tab = this.tabs.find((t) => t.id === id)
      if (!tab) return
      const wasActive = id === this.activeTabId
      if (tab.sessionId) {
        disconnectSftp(tab.sessionId).catch(() => undefined)
      }
      this.tabs = this.tabs.filter((t) => t.id !== id)
      this.notify(`已断开连接：${tab.server.name || tab.server.host || ''}`, 'info')
      this.activateFallback(wasActive)
    },

    handleSessionLost(tabId: number) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) return
      const wasActive = tabId === this.activeTabId
      this.tabs = this.tabs.filter((t) => t.id !== tabId)
      this.notify(`SFTP 会话已断开：${tab.server.name || tab.server.host || '请重新连接'}`, 'warning')
      this.activateFallback(wasActive)
    },

    async loadLocal(path: string) {
      this.localLoading = true
      this.localError = ''
      try {
        const data = await listLocal(path || '')
        this.localPath = data.path
        this.localParent = data.parent
        if (data.home) this.localHome = data.home
        this.localSelected = []
        this.localAnchor = null
        this.localItems = data.items
        this.localSug = emptySuggest()
      } catch (cause) {
        this.localError = errorMessage(cause, '读取失败')
        this.localItems = []
      } finally {
        this.localLoading = false
      }
    },

    async loadRemote(path: string, tabId?: number) {
      const tab = tabId != null
        ? this.tabs.find((t) => t.id === tabId) ?? null
        : this.activeTab
      if (!tab?.sessionId) return
      tab.loading = true
      tab.error = ''
      try {
        const data = await listRemote(tab.sessionId, path || '.')
        tab.path = data.path
        tab.selected = []
        tab.anchor = null
        tab.items = data.items
        tab.sug = emptySuggest()
      } catch (cause) {
        const message = errorMessage(cause, '读取失败')
        if (isSessionLostMessage(message)) {
          this.handleSessionLost(tab.id)
          return
        }
        tab.error = message
        tab.items = []
      } finally {
        tab.loading = false
      }
    },

    localUp() {
      if (this.localParent) void this.loadLocal(this.localParent)
    },
    goLocalHome() {
      void this.loadLocal(this.localHome || '')
    },
    localRefresh() {
      void this.loadLocal(this.localPath || '')
    },
    enterLocal(name: string) {
      void this.loadLocal(joinLocal(this.localPath, name))
    },

    remoteUp() {
      const path = this.remotePath
      const parent = dirnamePosix(path)
      if (parent && parent !== path) void this.loadRemote(parent)
    },
    goRemoteHome() {
      void this.loadRemote(this.remoteDefault || '.')
    },
    remoteRefresh() {
      if (this.remotePath) void this.loadRemote(this.remotePath)
    },
    enterRemote(name: string) {
      void this.loadRemote(joinPosix(this.remotePath, name))
    },

    refreshAll() {
      this.localRefresh()
      if (this.sessionId) this.remoteRefresh()
    },

    toggleSort(side: FtSide, key: FtSortKey) {
      if (side === 'local') {
        if (this.localSort.key === key) this.localSort.dir = this.localSort.dir < 0 ? 1 : -1
        else this.localSort = { key, dir: 1 }
        try {
          storageSet(SORT_LOCAL_KEY, JSON.stringify(this.localSort))
        } catch { /* ignore */ }
        return
      }
      const tab = this.activeTab
      if (!tab) return
      if (tab.sort.key === key) tab.sort.dir = tab.sort.dir < 0 ? 1 : -1
      else tab.sort = { key, dir: 1 }
      try {
        storageSet(SORT_REMOTE_KEY, JSON.stringify(tab.sort))
      } catch { /* ignore */ }
    },

    setSplitRatio(ratio: number) {
      const clamped = Math.max(0.2, Math.min(0.8, ratio))
      this.splitRatio = clamped
      try {
        storageSet(SPLIT_KEY, clamped.toFixed(4))
      } catch { /* ignore */ }
    },

    selectClick(side: FtSide, name: string | null, opts: { shift?: boolean; meta?: boolean } = {}) {
      if (side === 'local') {
        this.applySelection('local', name, opts)
        return
      }
      this.applySelection('remote', name, opts)
    },

    applySelection(side: FtSide, name: string | null, opts: { shift?: boolean; meta?: boolean }) {
      const items = side === 'local' ? this.sortedLocalItems : this.sortedRemoteItems
      const names = items.map((it) => it.name)
      if (side === 'local') {
        if (!name) {
          this.localSelected = []
          return
        }
        if (opts.shift && this.localAnchor) {
          this.localSelected = rangeSelect(names, this.localAnchor, name)
        } else if (opts.meta) {
          const set = new Set(this.localSelected)
          if (set.has(name)) set.delete(name)
          else set.add(name)
          this.localSelected = [...set]
          this.localAnchor = name
        } else {
          this.localSelected = [name]
          this.localAnchor = name
        }
        return
      }
      const tab = this.activeTab
      if (!tab) return
      if (!name) {
        tab.selected = []
        return
      }
      if (opts.shift && tab.anchor) {
        tab.selected = rangeSelect(names, tab.anchor, name)
      } else if (opts.meta) {
        const set = new Set(tab.selected)
        if (set.has(name)) set.delete(name)
        else set.add(name)
        tab.selected = [...set]
        tab.anchor = name
      } else {
        tab.selected = [name]
        tab.anchor = name
      }
    },

    setSelection(side: FtSide, name: string | null) {
      if (side === 'local') {
        this.localSelected = name ? [name] : []
        this.localAnchor = name
        return
      }
      const tab = this.activeTab
      if (!tab) return
      tab.selected = name ? [name] : []
      tab.anchor = name
    },

    async mkdir(side: FtSide, name: string) {
      const trimmed = name.trim()
      if (!trimmed) return
      try {
        if (side === 'local') {
          if (!this.localPath) return
          await mkdirLocal(joinLocal(this.localPath, trimmed))
          this.notify(`已新建文件夹：${trimmed}`, 'success')
          this.localRefresh()
        } else {
          if (!this.sessionId || !this.remotePath) return
          await mkdirRemote(this.sessionId, joinPosix(this.remotePath, trimmed))
          this.notify(`已新建文件夹：${trimmed}`, 'success')
          this.remoteRefresh()
        }
      } catch (cause) {
        this.opError(side, cause, '新建失败')
      }
    },

    async rename(side: FtSide, fromName: string, toName: string) {
      const next = toName.trim()
      if (!next || next === fromName) return
      try {
        if (side === 'local') {
          await renameLocal(joinLocal(this.localPath, fromName), joinLocal(this.localPath, next))
        } else {
          if (!this.sessionId) return
          await renameRemote(
            this.sessionId,
            joinPosix(this.remotePath, fromName),
            joinPosix(this.remotePath, next),
          )
        }
        this.notify(`已重命名：${fromName} → ${next}`, 'success')
        if (side === 'local') this.localRefresh()
        else this.remoteRefresh()
      } catch (cause) {
        this.opError(side, cause, '重命名失败')
      }
    },

    async remove(side: FtSide, names: string[]) {
      const list = names.filter(Boolean)
      if (!list.length) return
      const items = side === 'local' ? this.localItems : this.remoteItems
      const byName = new Map(items.map((it) => [it.name, it]))
      let fail = 0
      for (const n of list) {
        const isDir = Boolean(byName.get(n)?.isDir)
        try {
          if (side === 'local') {
            await deleteLocal(joinLocal(this.localPath, n), isDir)
          } else {
            if (!this.sessionId) return
            await deleteRemote(this.sessionId, joinPosix(this.remotePath, n), isDir)
          }
        } catch (cause) {
          fail += 1
          const message = errorMessage(cause, '')
          if (side === 'remote' && isSessionLostMessage(message) && this.activeTab) {
            this.handleSessionLost(this.activeTab.id)
            return
          }
        }
      }
      if (side === 'local') this.localSelected = []
      else if (this.activeTab) this.activeTab.selected = []
      if (fail) this.notify(`部分删除失败（${fail}/${list.length}）`, 'error')
      else this.notify(list.length === 1 ? `已删除：${list[0]}` : `已删除：${list.length} 项`, 'success')
      if (side === 'local') this.localRefresh()
      else this.remoteRefresh()
    },

    opError(side: FtSide, cause: unknown, title: string) {
      const message = errorMessage(cause, '未知错误')
      if (side === 'remote' && isSessionLostMessage(message) && this.activeTab) {
        this.handleSessionLost(this.activeTab.id)
        return
      }
      this.notify(`${title}：${message}`, 'error')
    },

    async upload(names?: string[]) {
      if (!this.sessionId) {
        this.notify('请先连接服务器', 'warning')
        return
      }
      const list = names?.length ? names : this.localSelected
      if (!list.length) {
        this.notify('请先在本地栏选中要上传的项', 'warning')
        return
      }
      const items = list.map((n) => ({
        from: joinLocal(this.localPath, n),
        to: joinPosix(this.remotePath, n),
      }))
      await this.enqueueTransfer('upload', items, list.length === 1 ? list[0] : `${list.length} 项`)
    },

    async download(names?: string[]) {
      if (!this.sessionId) return
      const list = names?.length ? names : this.remoteSelected
      if (!list.length) {
        this.notify('请先在远程栏选中要下载的项', 'warning')
        return
      }
      const items = list.map((n) => ({
        from: joinPosix(this.remotePath, n),
        to: joinLocal(this.localPath, n),
      }))
      await this.enqueueTransfer('download', items, list.length === 1 ? list[0] : `${list.length} 项`)
    },

    async enqueueTransfer(direction: TransferDirection, items: { from: string; to: string }[], label: string) {
      const sid = this.sessionId
      if (!sid) return
      const srvName = this.currentServer?.name || this.currentServer?.host || ''
      try {
        const { taskId } = await startTransfer(sid, {
          direction,
          items,
          onConflict: this.conflictPolicy,
        })
        this.registerTask(taskId, {
          direction,
          sessionId: sid,
          serverName: srvName,
          curName: label,
        })
        this.notify(direction === 'upload' ? `开始上传：${label}` : `开始下载：${label}`, 'info')
      } catch (cause) {
        this.opError('remote', cause, '传输启动失败')
      }
    },

    /**
     * HTTP 入队返回后登记任务。若 WS `started` 已抢先建好条目，必须补登 sessionId，
     * 否则完成后无法刷新对应远程列表。
     */
    registerTask(
      taskId: string,
      meta: { direction: TransferDirection; sessionId: string; serverName?: string; curName?: string },
    ) {
      const exist = this.tasks[taskId]
      if (exist) {
        exist.sessionId = meta.sessionId
        exist.serverName = meta.serverName
        if (meta.curName && !exist.curName) exist.curName = meta.curName
        return
      }
      this.tasks[taskId] = {
        taskId,
        direction: meta.direction,
        sessionId: meta.sessionId,
        serverName: meta.serverName,
        state: 'queued',
        filesTotal: 0,
        filesDone: 0,
        curName: meta.curName || '',
        curPercent: 0,
        speed: 0,
        etaSec: 0,
        startedAt: Date.now(),
      }
    },

    applyTransferEvent(payload: TransferEventPayload) {
      if (!payload?.taskId) return
      let task = this.tasks[payload.taskId]
      if (!task) {
        task = {
          taskId: payload.taskId,
          direction: payload.direction === 'download' ? 'download' : 'upload',
          state: 'transferring',
          filesTotal: 0,
          filesDone: 0,
          curName: '',
          curPercent: 0,
          speed: 0,
          etaSec: 0,
          startedAt: Date.now(),
        }
        this.tasks[payload.taskId] = task
      }
      if (typeof payload.filesTotal === 'number' && payload.filesTotal) task.filesTotal = payload.filesTotal
      if (typeof payload.filesDone === 'number') task.filesDone = payload.filesDone
      switch (payload.phase) {
        case 'started':
          task.state = 'transferring'
          break
        case 'progress':
          task.state = 'transferring'
          task.curName = payload.name || task.curName
          task.curPercent = payload.percent || 0
          task.speed = payload.speed || 0
          task.etaSec = payload.etaSec || 0
          break
        case 'file-done':
        case 'file-skipped':
        case 'file-failed':
          task.curName = payload.name || task.curName
          task.curPercent = 100
          if (payload.phase === 'file-failed') task.lastError = payload.error
          break
        case 'done':
          task.state = 'done'
          task.curPercent = 100
          this.afterTransferDone(task)
          break
        case 'failed':
          task.state = 'failed'
          task.error = payload.error
          this.afterTransferDone(task)
          break
        case 'cancelled':
          task.state = 'cancelled'
          this.afterTransferDone(task)
          break
        default:
          break
      }
    },

    afterTransferDone(task: FtTransferTask) {
      if (task.direction === 'upload') {
        if (this.sessionId && task.sessionId === this.sessionId) this.remoteRefresh()
      } else {
        this.localRefresh()
      }
      const dir = task.direction === 'upload' ? '上传' : '下载'
      const place = task.direction === 'upload' ? '远程' : '本地'
      const what = task.filesTotal > 1 ? `${task.filesTotal} 个文件` : (task.curName || '文件')
      if (task.state === 'done') this.notify(`传输完成：${what}`, 'success')
      else if (task.state === 'cancelled') this.notify(`已取消传输：${what}`, 'info')
      else this.notify(`传输失败：${task.error || what}`, 'error')

      if (task.state !== 'cancelled') {
        const title = task.state === 'done' ? `${dir}完成` : `${dir}失败`
        const body = task.state === 'done'
          ? `${what} 已${dir}到${place}`
          : `${what} ${dir}失败${task.error ? `：${task.error}` : ''}`
        void sendDesktopNotification(title, body, task.state === 'done', { target: 'filetransfer' })
      }
    },

    /** 供 session service：按 sessionId 刷新对应 tab 的远程目录。 */
    refreshRemoteForSession(sessionId: string) {
      const tab = this.tabs.find((t) => t.sessionId === sessionId)
      if (!tab?.path) return
      void this.loadRemote(tab.path, tab.id)
    },

    async cancelTask(taskId: string) {
      try {
        await cancelTransfer(taskId)
      } catch {
        /* 已结束/不存在，忽略 */
      }
    },

    clearFinished() {
      for (const [id, task] of Object.entries(this.tasks)) {
        if (['done', 'failed', 'cancelled'].includes(task.state)) delete this.tasks[id]
      }
    },

    removeTask(taskId: string) {
      delete this.tasks[taskId]
    },

    async cancelAll() {
      for (const task of Object.values(this.tasks)) {
        if (task.state === 'queued' || task.state === 'transferring') {
          try {
            await cancelTransfer(task.taskId)
          } catch { /* ignore */ }
        }
      }
    },
  },
})

function rangeSelect(names: string[], fromName: string, toName: string): string[] {
  let i = names.indexOf(fromName)
  let j = names.indexOf(toName)
  if (i < 0 || j < 0) return [toName]
  if (i > j) {
    const t = i
    i = j
    j = t
  }
  return names.slice(i, j + 1)
}

function statusBarText(items: FtFileItem[], selected: string[]): string {
  if (selected.length) {
    let selSize = 0
    items.forEach((it) => {
      if (selected.includes(it.name) && !it.isDir) selSize += it.size || 0
    })
    return `已选 ${selected.length} 项 · ${formatSize(selSize)}　/　共 ${items.length} 项`
  }
  const total = items.reduce((s, it) => s + (it.isDir ? 0 : (it.size || 0)), 0)
  return items.length ? `共 ${items.length} 项 · ${formatSize(total)}` : ''
}
