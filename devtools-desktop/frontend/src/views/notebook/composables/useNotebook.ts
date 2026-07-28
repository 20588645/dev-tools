import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'

import {
  createNotebookNote,
  deleteNotebookNote,
  getNotebookNote,
  listNotebookNotes,
  reorderNotebookNotes,
  updateNotebookNote,
  type NotebookRecord,
  type NotebookSummary,
  type NotebookUpdateInput,
} from '@/services/modules/notebook-service'

import { notebookTextFromHtml, sanitizeNotebookHtml } from '../notebook-html'

export type NotebookLoadState = 'idle' | 'loading' | 'loaded' | 'error'
export type NotebookSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type NotebookFilter = 'all' | 'pinned' | 'media'
export type NotebookSort = 'updated' | 'created' | 'manual'

export interface NotebookDraft {
  id: string
  title: string
  content: string
  pinned: boolean
  createdAt: string
  updatedAt: string
  loadState: NotebookLoadState
  loadError: string
  saveState: NotebookSaveState
  saveError: string
  revision: number
  savedRevision: number
  lastSavedAt: Date | null
}

interface NotebookServices {
  list: typeof listNotebookNotes
  get: typeof getNotebookNote
  create: typeof createNotebookNote
  update: typeof updateNotebookNote
  remove: typeof deleteNotebookNote
  reorder: typeof reorderNotebookNotes
}

interface NotebookOptions {
  services?: Partial<NotebookServices>
  saveDelay?: number
  searchDelay?: number
  now?: () => Date
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : String(reason || fallback)
}

function createDraft(record: NotebookRecord): NotebookDraft {
  return reactive({
    id: record.id,
    title: record.title,
    content: sanitizeNotebookHtml(record.content),
    pinned: record.pinned,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    loadState: 'loaded',
    loadError: '',
    saveState: 'saved',
    saveError: '',
    revision: 0,
    savedRevision: 0,
    lastSavedAt: record.updatedAt ? new Date(record.updatedAt) : null,
  })
}

function previewFromDraft(draft: NotebookDraft) {
  return notebookTextFromHtml(draft.content).slice(0, 80)
}

export function notebookSaveLabel(draft: NotebookDraft | null) {
  if (!draft) return '未选择笔记'
  if (draft.saveState === 'dirty') return '等待保存'
  if (draft.saveState === 'saving') return '正在保存'
  if (draft.saveState === 'error') return '保存失败'
  if (draft.saveState === 'saved' && draft.lastSavedAt) {
    return `已保存 · ${draft.lastSavedAt.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }
  return draft.saveState === 'saved' ? '已保存' : '暂无内容'
}

export function useNotebook(options: NotebookOptions = {}) {
  const services: NotebookServices = {
    list: options.services?.list ?? listNotebookNotes,
    get: options.services?.get ?? getNotebookNote,
    create: options.services?.create ?? createNotebookNote,
    update: options.services?.update ?? updateNotebookNote,
    remove: options.services?.remove ?? deleteNotebookNote,
    reorder: options.services?.reorder ?? reorderNotebookNotes,
  }
  const now = options.now ?? (() => new Date())
  const saveDelay = options.saveDelay ?? 800
  const searchDelay = options.searchDelay ?? 280
  const notes = ref<NotebookSummary[]>([])
  const drafts = reactive<Record<string, NotebookDraft>>({})
  const currentId = ref('')
  const search = ref('')
  const appliedSearch = ref('')
  const filter = ref<NotebookFilter>('all')
  const sort = ref<NotebookSort>('updated')
  const listState = ref<NotebookLoadState>('idle')
  const listError = ref('')
  const initialized = ref(false)
  const listController = ref<AbortController | null>(null)
  const detailController = ref<AbortController | null>(null)
  let listVersion = 0
  let detailVersion = 0
  let startPromise: Promise<void> | null = null
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const saveQueues = new Map<string, Promise<void>>()
  const queuedRevisions = new Map<string, number>()

  const currentDraft = computed(() => drafts[currentId.value] ?? null)
  const visibleNotes = computed(() => {
    let result = notes.value.filter((note) => {
      if (filter.value === 'pinned') return note.pinned
      if (filter.value === 'media') return note.hasMedia
      return true
    })

    if (sort.value === 'created') {
      result = [...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } else if (sort.value === 'updated') {
      result = [...result].sort((a, b) => {
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
        return b.updatedAt.localeCompare(a.updatedAt)
      })
    }
    return result
  })

  const dirtyCount = computed(() => Object.values(drafts).filter((draft) => (
    draft.revision > draft.savedRevision || draft.saveState === 'error'
  )).length)

  const globalStatus = computed(() => {
    if (listState.value === 'error') return { status: 'offline' as const, label: '本地服务暂不可用' }
    if (Object.values(drafts).some((draft) => draft.saveState === 'error')) {
      return { status: 'offline' as const, label: '部分笔记保存失败' }
    }
    if (Object.values(drafts).some((draft) => draft.saveState === 'dirty' || draft.saveState === 'saving')) {
      return { status: 'checking' as const, label: '正在保存笔记' }
    }
    if (listState.value === 'loading') return { status: 'checking' as const, label: '正在加载笔记' }
    return { status: 'online' as const, label: '笔记已保存在本机' }
  })

  function syncSummary(draft: NotebookDraft, record?: NotebookRecord) {
    const existing = notes.value.find((note) => note.id === draft.id)
    const next: NotebookSummary = {
      id: draft.id,
      title: draft.title,
      preview: previewFromDraft(draft),
      pinned: draft.pinned,
      sortOrder: record?.sortOrder ?? existing?.sortOrder ?? notes.value.length,
      hasMedia: /<img\b/i.test(draft.content),
      createdAt: record?.createdAt ?? draft.createdAt,
      updatedAt: record?.updatedAt ?? draft.updatedAt,
    }
    if (existing) Object.assign(existing, next)
    else notes.value.unshift(next)
  }

  function clearSaveTimer(id: string) {
    const timer = saveTimers.get(id)
    if (timer) globalThis.clearTimeout(timer)
    saveTimers.delete(id)
  }

  function enqueueSave(id: string, force = false) {
    const draft = drafts[id]
    if (!draft) return Promise.resolve()
    const revision = draft.revision
    const existingQueue = saveQueues.get(id)
    if (!force && existingQueue && (queuedRevisions.get(id) ?? -1) >= revision) return existingQueue
    if (!force && revision <= draft.savedRevision && draft.saveState !== 'error') return Promise.resolve()

    const snapshot: NotebookUpdateInput = {
      title: draft.title,
      content: sanitizeNotebookHtml(draft.content),
      pinned: draft.pinned,
    }
    const previous = existingQueue ?? Promise.resolve()
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        draft.saveState = 'saving'
        draft.saveError = ''
        try {
          const record = await services.update(id, snapshot)
          draft.savedRevision = Math.max(draft.savedRevision, revision)
          draft.updatedAt = record.updatedAt
          draft.lastSavedAt = now()
          draft.saveState = draft.revision > revision ? 'dirty' : 'saved'
          syncSummary(draft, record)
        } catch (reason) {
          if (draft.revision > revision) {
            draft.saveState = 'dirty'
          } else {
            draft.saveState = 'error'
            draft.saveError = errorMessage(reason, '保存失败，请稍后重试')
          }
        }
      })
      .finally(() => {
        if (saveQueues.get(id) === task) {
          saveQueues.delete(id)
          queuedRevisions.delete(id)
        }
      })

    queuedRevisions.set(id, revision)
    saveQueues.set(id, task)
    return task
  }

  function scheduleSave(id: string) {
    clearSaveTimer(id)
    saveTimers.set(id, globalThis.setTimeout(() => {
      saveTimers.delete(id)
      void enqueueSave(id)
    }, saveDelay))
  }

  function updateCurrent(field: 'title' | 'content', value: string) {
    const draft = currentDraft.value
    if (!draft || draft[field] === value) return
    draft[field] = value
    draft.revision += 1
    draft.saveState = 'dirty'
    draft.saveError = ''
    syncSummary(draft)
    scheduleSave(draft.id)
  }

  async function flushNote(id: string) {
    clearSaveTimer(id)
    await enqueueSave(id)
  }

  async function flushCurrent() {
    if (currentId.value) await flushNote(currentId.value)
  }

  async function flushAll() {
    await Promise.all(Object.values(drafts).filter((draft) => (
      draft.revision > draft.savedRevision || draft.saveState === 'error'
    )).map((draft) => flushNote(draft.id)))
  }

  async function loadNote(id: string, force = false) {
    if (!id) return
    const existing = drafts[id]
    if (!force && existing?.loadState === 'loaded') return
    if (existing && existing.revision > existing.savedRevision) return

    const version = ++detailVersion
    detailController.value?.abort()
    const controller = new AbortController()
    detailController.value = controller
    const placeholder = existing ?? reactive<NotebookDraft>({
      id,
      title: notes.value.find((note) => note.id === id)?.title ?? '',
      content: '',
      pinned: notes.value.find((note) => note.id === id)?.pinned ?? false,
      createdAt: notes.value.find((note) => note.id === id)?.createdAt ?? '',
      updatedAt: notes.value.find((note) => note.id === id)?.updatedAt ?? '',
      loadState: 'loading',
      loadError: '',
      saveState: 'idle',
      saveError: '',
      revision: 0,
      savedRevision: 0,
      lastSavedAt: null,
    })
    drafts[id] = placeholder
    placeholder.loadState = 'loading'
    placeholder.loadError = ''
    const initialRevision = placeholder.revision

    try {
      const record = await services.get(id, controller.signal)
      if (controller.signal.aborted || version !== detailVersion || placeholder.revision !== initialRevision) return
      drafts[id] = createDraft(record)
    } catch (reason) {
      if (controller.signal.aborted || version !== detailVersion || placeholder.revision !== initialRevision) return
      placeholder.loadState = 'error'
      placeholder.loadError = errorMessage(reason, '笔记加载失败，请稍后重试')
    } finally {
      if (version === detailVersion) detailController.value = null
    }
  }

  async function selectNote(id: string) {
    if (!id || id === currentId.value) return
    await flushCurrent()
    currentId.value = id
    await loadNote(id)
  }

  async function loadList(force = false) {
    if (!force && initialized.value && listState.value === 'loaded' && appliedSearch.value === search.value.trim()) return
    const version = ++listVersion
    listController.value?.abort()
    const controller = new AbortController()
    listController.value = controller
    listState.value = 'loading'
    listError.value = ''
    const query = search.value.trim()

    try {
      await flushCurrent()
      const result = await services.list(query, controller.signal)
      if (controller.signal.aborted || version !== listVersion) return
      notes.value = result
      appliedSearch.value = query
      listState.value = 'loaded'
      initialized.value = true
      if (!currentId.value && result[0]) {
        currentId.value = result[0].id
        await loadNote(result[0].id)
      }
    } catch (reason) {
      if (controller.signal.aborted || version !== listVersion) return
      listState.value = 'error'
      listError.value = errorMessage(reason, '笔记列表加载失败，请稍后重试')
    } finally {
      if (version === listVersion) listController.value = null
    }
  }

  function scheduleSearch() {
    if (searchTimer) globalThis.clearTimeout(searchTimer)
    searchTimer = globalThis.setTimeout(() => {
      searchTimer = null
      void loadList(true)
    }, searchDelay)
  }

  async function createNote() {
    await flushCurrent()
    const record = await services.create({ title: '', content: '' })
    const draft = createDraft(record)
    drafts[record.id] = draft
    syncSummary(draft, record)
    currentId.value = record.id
    return record.id
  }

  async function duplicateCurrent() {
    const draft = currentDraft.value
    if (!draft) return ''
    await flushCurrent()
    const record = await services.create({
      title: `${draft.title || '无标题'} · 副本`,
      content: sanitizeNotebookHtml(draft.content),
    })
    drafts[record.id] = createDraft(record)
    syncSummary(drafts[record.id], record)
    currentId.value = record.id
    return record.id
  }

  async function removeCurrent() {
    const id = currentId.value
    if (!id) return
    clearSaveTimer(id)
    await services.remove(id)
    const index = notes.value.findIndex((note) => note.id === id)
    notes.value = notes.value.filter((note) => note.id !== id)
    delete drafts[id]
    const next = notes.value[index] ?? notes.value[index - 1] ?? notes.value[0]
    currentId.value = next?.id ?? ''
    if (next) await loadNote(next.id)
  }

  function togglePin() {
    const draft = currentDraft.value
    if (!draft) return
    draft.pinned = !draft.pinned
    draft.revision += 1
    draft.saveState = 'dirty'
    syncSummary(draft)
    scheduleSave(draft.id)
  }

  async function moveNote(id: string, direction: -1 | 1) {
    if (sort.value !== 'manual' || filter.value !== 'all' || appliedSearch.value) return
    const index = notes.value.findIndex((note) => note.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= notes.value.length) return
    const next = [...notes.value]
    ;[next[index], next[target]] = [next[target], next[index]]
    notes.value = next
    try {
      await services.reorder(next.map((note) => note.id))
    } catch (reason) {
      listError.value = errorMessage(reason, '排序保存失败')
      await loadList(true)
    }
  }

  function retryCurrentLoad() {
    if (currentId.value) return loadNote(currentId.value, true)
    return Promise.resolve()
  }

  function retryCurrentSave() {
    const draft = currentDraft.value
    return draft ? enqueueSave(draft.id, true) : Promise.resolve()
  }

  watch(search, scheduleSearch)

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (dirtyCount.value === 0) return
    void flushAll()
    event.preventDefault()
  }

  async function start() {
    if (initialized.value) return
    if (!startPromise) {
      startPromise = loadList(true).finally(() => {
        startPromise = null
      })
    }
    await startPromise
  }

  onMounted(() => {
    globalThis.addEventListener('beforeunload', handleBeforeUnload)
    void start()
  })
  onActivated(() => {
    void start()
  })
  onDeactivated(() => {
    void flushAll()
  })
  onBeforeUnmount(() => {
    if (searchTimer) globalThis.clearTimeout(searchTimer)
    saveTimers.forEach((timer) => globalThis.clearTimeout(timer))
    saveTimers.clear()
    listController.value?.abort()
    detailController.value?.abort()
    globalThis.removeEventListener('beforeunload', handleBeforeUnload)
    void flushAll()
  })

  return {
    notes,
    visibleNotes,
    currentId,
    currentDraft,
    search,
    appliedSearch,
    filter,
    sort,
    listState,
    listError,
    globalStatus,
    dirtyCount,
    loadList,
    selectNote,
    createNote,
    duplicateCurrent,
    removeCurrent,
    updateCurrent,
    togglePin,
    moveNote,
    flushCurrent,
    flushAll,
    retryCurrentLoad,
    retryCurrentSave,
  }
}
