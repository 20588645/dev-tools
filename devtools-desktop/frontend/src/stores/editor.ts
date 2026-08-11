import { defineStore } from 'pinia'

import {
  browseEditorDir,
  createEditorDraft,
  deleteEditorDraft,
  listEditorDrafts,
  readEditorFile,
  updateEditorDraft,
  writeEditorFile,
  type EditorBrowseResult,
  type EditorEol,
} from '@/services/modules/editor-service'
import { useNotificationStore } from '@/stores/notification'
import { hasConfirmableDirtyTabs, tabNeedsConfirm } from '@/views/editor/editor-dirty'
import {
  createEditorDoc,
  getEditorDoc,
  isEditorDocContentEmpty,
  isEditorDocDirty,
  markEditorDocClean,
  removeEditorDoc,
  renameEditorDocKey,
  setEditorDoc,
} from '@/views/editor/editor-docs'
import { ED_TABS_LS_KEY, edModeForExt } from '@/views/editor/editor-modes'

export type EditorSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'latest' | 'error'

export interface EditorTabMeta {
  key: string
  path: string
  name: string
  ext: string
  eol: EditorEol
  mtime: number
  isDraft: boolean
  draftId: string | null
  dirty: boolean
}

export type EditorClosedItem =
  | { kind: 'draft'; name: string; content: string }
  | { kind: 'file'; path: string }

function notify() {
  return useNotificationStore()
}

function loadSessionPaths(): { order: string[]; active: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(ED_TABS_LS_KEY) || 'null') as {
      order?: unknown
      active?: unknown
    } | null
    const order = Array.isArray(raw?.order)
      ? raw.order.filter((p): p is string => typeof p === 'string' && !p.startsWith('draft:'))
      : []
    const active = typeof raw?.active === 'string' && !raw.active.startsWith('draft:')
      ? raw.active
      : null
    return { order, active }
  } catch {
    return { order: [], active: null }
  }
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    order: [] as string[],
    active: null as string | null,
    tabs: {} as Record<string, EditorTabMeta>,
    untitledSeq: 0,
    sessionRestored: false,
    cursorLine: 1,
    cursorCol: 1,
    saveStatus: 'idle' as EditorSaveStatus,
    closedStack: [] as EditorClosedItem[],
    browse: null as EditorBrowseResult | null,
    browseLoading: false,
  }),

  getters: {
    tabList(state): EditorTabMeta[] {
      return state.order.map((key) => state.tabs[key]).filter(Boolean)
    },
    activeTab(state): EditorTabMeta | null {
      return state.active ? state.tabs[state.active] ?? null : null
    },
    hasTabs(state): boolean {
      return state.order.length > 0
    },
    /** 离开页面 / 批量关闭用的确认判定 */
    confirmableDirtyTabs(state): EditorTabMeta[] {
      return state.order
        .map((key) => state.tabs[key])
        .filter(Boolean)
        .filter((tab) => tabNeedsConfirm({
          dirty: isEditorDocDirty(tab.key) || tab.dirty,
          isDraft: tab.isDraft,
          isContentEmpty: isEditorDocContentEmpty(tab.key),
        }))
    },
    needsLeaveConfirm(): boolean {
      return this.confirmableDirtyTabs.length > 0
    },
  },

  actions: {
    syncDirtyFromDoc(key: string) {
      const tab = this.tabs[key]
      if (!tab) return
      const dirty = isEditorDocDirty(key)
      if (tab.dirty !== dirty) tab.dirty = dirty
      if (this.active === key) {
        this.saveStatus = dirty ? 'dirty' : 'saved'
      }
    },

    persistSession() {
      try {
        const order = this.order.filter((k) => !k.startsWith('draft:'))
        const active = this.active && !this.active.startsWith('draft:') ? this.active : null
        localStorage.setItem(ED_TABS_LS_KEY, JSON.stringify({ order, active }))
      } catch {
        /* ignore quota */
      }
    },

    pushClosed(item: EditorClosedItem) {
      this.closedStack.push(item)
      if (this.closedStack.length > 20) this.closedStack.shift()
    },

    newScratchTab(opts: { name?: string; content?: string; draftId?: string | null } = {}): string {
      this.untitledSeq += 1
      const key = `draft:${this.untitledSeq}`
      const doc = createEditorDoc(opts.content || '', null)
      setEditorDoc(key, doc)
      const tab: EditorTabMeta = {
        key,
        path: key,
        name: opts.name || `未命名-${this.untitledSeq}`,
        ext: '',
        eol: 'LF',
        mtime: 0,
        isDraft: true,
        draftId: opts.draftId ?? null,
        dirty: false,
      }
      this.tabs[key] = tab
      this.order.push(key)
      this.activate(key)
      return key
    },

    activate(key: string) {
      const tab = this.tabs[key]
      if (!tab) return
      this.active = key
      this.syncDirtyFromDoc(key)
      this.persistSession()
    },

    async openPath(filePath: string, opts: { silent?: boolean } = {}): Promise<boolean> {
      if (!filePath) return false
      if (this.tabs[filePath]) {
        this.activate(filePath)
        return true
      }
      try {
        const file = await readEditorFile(filePath)
        const mode = edModeForExt(file.ext)
        const doc = createEditorDoc(file.content, mode)
        setEditorDoc(file.path, doc)
        this.tabs[file.path] = {
          key: file.path,
          path: file.path,
          name: file.name,
          ext: file.ext,
          eol: file.eol,
          mtime: file.mtime,
          isDraft: false,
          draftId: null,
          dirty: false,
        }
        this.order.push(file.path)
        this.activate(file.path)
        this.persistSession()
        return true
      } catch (error) {
        if (!opts.silent) {
          notify().push(error instanceof Error ? error.message : String(error), 'error')
        }
        return false
      }
    },

    /**
     * 关闭单个标签。`confirm` 由 View 注入（ConfirmDialog）；返回 false 表示用户取消。
     */
    async closeTab(
      key: string,
      confirm: (message: string, opts: { confirmText: string }) => Promise<boolean>,
    ): Promise<boolean> {
      const tab = this.tabs[key]
      if (!tab) return true
      if (tabNeedsConfirm({
        dirty: isEditorDocDirty(key) || tab.dirty,
        isDraft: tab.isDraft,
        isContentEmpty: isEditorDocContentEmpty(key),
      })) {
        const msg = tab.isDraft
          ? `草稿「${tab.name}」有未保存的修改，关闭将丢弃，确定？`
          : `「${tab.name}」有未保存的修改，确定关闭？`
        const ok = await confirm(msg, {
          confirmText: tab.isDraft ? '丢弃关闭' : '不保存关闭',
        })
        if (!ok) return false
      }
      this.forceCloseTab(key)
      return true
    },

    forceCloseTab(key: string) {
      const tab = this.tabs[key]
      if (!tab) return
      const doc = getEditorDoc(key)
      const content = doc?.getValue() ?? ''
      if (tab.isDraft) {
        if (tab.draftId) {
          void deleteEditorDraft(tab.draftId).catch(() => {})
        }
        this.pushClosed({ kind: 'draft', name: tab.name, content })
      } else {
        this.pushClosed({ kind: 'file', path: tab.path })
      }

      removeEditorDoc(key)
      delete this.tabs[key]
      this.order = this.order.filter((p) => p !== key)

      if (this.active === key) {
        const next = this.order[this.order.length - 1] || null
        if (next) {
          this.activate(next)
        } else {
          this.active = null
          this.newScratchTab()
        }
      }
      this.persistSession()
    },

    async batchClose(
      targets: string[],
      keepKey: string | null,
      confirm: (message: string, opts: { confirmText: string }) => Promise<boolean>,
    ): Promise<boolean> {
      if (!targets.length) return true
      const anyDirty = hasConfirmableDirtyTabs(targets.map((k) => {
        const t = this.tabs[k]
        return {
          dirty: t ? (isEditorDocDirty(k) || t.dirty) : false,
          isDraft: Boolean(t?.isDraft),
          isContentEmpty: isEditorDocContentEmpty(k),
        }
      }))
      if (anyDirty) {
        const ok = await confirm('有未保存的标签，确定全部关闭？（草稿会被丢弃）', {
          confirmText: '全部关闭',
        })
        if (!ok) return false
      }
      for (const k of targets) this.forceCloseTab(k)
      if (keepKey && this.tabs[keepKey]) this.activate(keepKey)
      return true
    },

    closeOthers(
      key: string,
      confirm: (message: string, opts: { confirmText: string }) => Promise<boolean>,
    ) {
      return this.batchClose(this.order.filter((k) => k !== key), key, confirm)
    },

    closeToRight(
      key: string,
      confirm: (message: string, opts: { confirmText: string }) => Promise<boolean>,
    ) {
      const idx = this.order.indexOf(key)
      return this.batchClose(this.order.slice(idx + 1), key, confirm)
    },

    async reopenClosed() {
      const item = this.closedStack.pop()
      if (!item) {
        notify().push('没有可恢复的标签', 'info')
        return
      }
      if (item.kind === 'file') {
        await this.openPath(item.path)
      } else {
        this.newScratchTab({ name: item.name, content: item.content })
      }
    },

    async renameDraft(key: string, newName: string) {
      const tab = this.tabs[key]
      if (!tab || !tab.isDraft) return
      const name = newName.trim() || tab.name
      tab.name = name
      if (tab.draftId) {
        try {
          await updateEditorDraft(tab.draftId, { title: name })
        } catch {
          /* rename soft-fail like legacy */
        }
      }
    },

    async saveCurrent(): Promise<boolean> {
      const key = this.active
      if (!key) return false
      const tab = this.tabs[key]
      if (!tab) return false
      const doc = getEditorDoc(key)
      if (!doc) return false

      if (!isEditorDocDirty(key)) {
        this.saveStatus = 'latest'
        return true
      }

      const content = doc.getValue()
      this.saveStatus = 'saving'

      if (tab.isDraft) {
        try {
          if (tab.draftId) {
            await updateEditorDraft(tab.draftId, { title: tab.name, content })
          } else {
            const d = await createEditorDraft({ title: tab.name, content })
            tab.draftId = d.id
          }
          markEditorDocClean(key)
          tab.dirty = false
          this.saveStatus = 'saved'
          return true
        } catch (error) {
          this.saveStatus = 'error'
          notify().push(`保存失败: ${error instanceof Error ? error.message : error}`, 'error')
          return false
        }
      }

      try {
        const r = await writeEditorFile(tab.path, content, tab.eol)
        markEditorDocClean(key)
        tab.dirty = false
        tab.mtime = r.mtime
        this.saveStatus = 'saved'
        return true
      } catch (error) {
        this.saveStatus = 'error'
        notify().push(`保存失败: ${error instanceof Error ? error.message : error}`, 'error')
        return false
      }
    },

    async saveAs(key: string, targetPath: string, filename: string): Promise<boolean> {
      const tab = this.tabs[key]
      if (!tab) return false
      const doc = getEditorDoc(key)
      if (!doc) return false
      if (this.tabs[targetPath]) {
        notify().push('该文件已在标签中打开', 'warning')
        return false
      }
      try {
        const r = await writeEditorFile(targetPath, doc.getValue(), tab.eol)
        if (tab.isDraft && tab.draftId) {
          try { await deleteEditorDraft(tab.draftId) } catch { /* ignore */ }
        }
        const ext = (filename.split('.').pop() || '').toLowerCase()
        renameEditorDocKey(key, targetPath)
        markEditorDocClean(targetPath)
        const next: EditorTabMeta = {
          key: targetPath,
          path: targetPath,
          name: filename,
          ext,
          eol: tab.eol,
          mtime: r.mtime,
          isDraft: false,
          draftId: null,
          dirty: false,
        }
        delete this.tabs[key]
        this.tabs[targetPath] = next
        this.order = this.order.map((k) => (k === key ? targetPath : k))
        if (this.active === key) this.active = targetPath
        this.saveStatus = 'saved'
        this.persistSession()
        notify().push(`已保存到 ${targetPath}`, 'success')
        return true
      } catch (error) {
        notify().push(`保存失败: ${error instanceof Error ? error.message : error}`, 'error')
        return false
      }
    },

    async loadBrowse(dir?: string) {
      this.browseLoading = true
      try {
        this.browse = await browseEditorDir(dir)
      } catch (error) {
        notify().push(error instanceof Error ? error.message : String(error), 'error')
      } finally {
        this.browseLoading = false
      }
    },

    async restoreSession() {
      if (this.sessionRestored) return
      this.sessionRestored = true
      try {
        const drafts = await listEditorDrafts()
        for (const d of drafts) {
          const key = this.newScratchTab({
            name: d.title || '未命名',
            content: d.content || '',
            draftId: d.id,
          })
          markEditorDocClean(key)
          const tab = this.tabs[key]
          if (tab) tab.dirty = false
        }
      } catch {
        /* DB 草稿恢复失败不阻塞 */
      }

      const saved = loadSessionPaths()
      for (const p of saved.order) {
        await this.openPath(p, { silent: true })
      }
      if (saved.active && this.tabs[saved.active]) {
        this.activate(saved.active)
      }
      if (this.order.length === 0) this.newScratchTab()
    },

    setCursor(line: number, col: number) {
      this.cursorLine = line
      this.cursorCol = col
    },
  },
})
