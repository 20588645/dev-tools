import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
} from 'vue'

import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  type TodoCreateInput,
  type TodoRecord,
  type TodoStatus,
  type TodoUpdateInput,
} from '@/services/modules/todo-service'

import {
  parseTodoContent,
  serializeTodoContent,
  type TodoChecklistItem,
} from '../todo-content'

export type TodoLoadState = 'idle' | 'loading' | 'loaded' | 'error'
export type TodoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type TodoFilter = 'all' | 'today' | 'overdue'

export interface TodoDraft extends TodoRecord {
  description: string
  checklist: TodoChecklistItem[]
  saveState: TodoSaveState
  saveError: string
  revision: number
  savedRevision: number
  lastSavedAt: Date | null
}

interface TodoServices {
  list: typeof listTodos
  create: typeof createTodo
  update: typeof updateTodo
  remove: typeof deleteTodo
  clearCompleted: typeof clearCompletedTodos
}

interface TodoOptions {
  services?: Partial<TodoServices>
  saveDelay?: number
  now?: () => Date
  lifecycle?: boolean
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : String(reason || fallback)
}

function createChecklistId() {
  return `check-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function toDraft(record: TodoRecord): TodoDraft {
  const parsed = parseTodoContent(record.content)
  return reactive({
    ...record,
    description: parsed.description,
    checklist: parsed.checklist.map((item) => ({ ...item, id: createChecklistId() })),
    saveState: 'saved',
    saveError: '',
    revision: 0,
    savedRevision: 0,
    lastSavedAt: record.updatedAt ? new Date(record.updatedAt) : null,
  })
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function todoTiming(todo: Pick<TodoRecord, 'remindAt' | 'status'>, now = new Date()) {
  if (!todo.remindAt || todo.status === 'done') return 'none' as const
  const remindAt = new Date(todo.remindAt)
  if (!Number.isFinite(remindAt.getTime())) return 'none' as const
  if (remindAt.getTime() < now.getTime()) return 'overdue' as const
  if (localDayKey(remindAt) === localDayKey(now)) return 'today' as const
  return 'future' as const
}

export function todoSaveLabel(draft: TodoDraft | null) {
  if (!draft) return '未选择任务'
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
  return '已保存'
}

export function useTodo(options: TodoOptions = {}) {
  const services: TodoServices = {
    list: options.services?.list ?? listTodos,
    create: options.services?.create ?? createTodo,
    update: options.services?.update ?? updateTodo,
    remove: options.services?.remove ?? deleteTodo,
    clearCompleted: options.services?.clearCompleted ?? clearCompletedTodos,
  }
  const now = options.now ?? (() => new Date())
  const saveDelay = options.saveDelay ?? 650
  const todos = ref<TodoDraft[]>([])
  const currentId = ref('')
  const search = ref('')
  const filter = ref<TodoFilter>('all')
  const collapsed = reactive<Record<TodoStatus, boolean>>({
    todo: false,
    doing: false,
    done: false,
  })
  const listState = ref<TodoLoadState>('idle')
  const listError = ref('')
  const initialized = ref(false)
  const loadController = ref<AbortController | null>(null)
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const saveQueues = new Map<string, Promise<void>>()
  let loadVersion = 0
  let startPromise: Promise<void> | null = null

  const currentTodo = computed(() => todos.value.find((todo) => todo.id === currentId.value) ?? null)
  const visibleTodos = computed(() => {
    const query = search.value.trim().toLocaleLowerCase('zh-CN')
    return todos.value.filter((todo) => {
      const timing = todoTiming(todo, now())
      if (filter.value === 'today' && timing !== 'today') return false
      if (filter.value === 'overdue' && timing !== 'overdue') return false
      if (!query) return true
      const haystack = [
        todo.title,
        todo.description,
        ...todo.checklist.map((item) => item.text),
      ].join(' ').toLocaleLowerCase('zh-CN')
      return haystack.includes(query)
    })
  })
  const groups = computed(() => ({
    todo: visibleTodos.value.filter((todo) => todo.status === 'todo'),
    doing: visibleTodos.value.filter((todo) => todo.status === 'doing'),
    done: visibleTodos.value.filter((todo) => todo.status === 'done'),
  }))
  const completedCount = computed(() => todos.value.filter((todo) => todo.status === 'done').length)
  const globalStatus = computed(() => {
    if (listState.value === 'error') return { status: 'offline' as const, label: '待办服务暂不可用' }
    if (todos.value.some((todo) => todo.saveState === 'error')) {
      return { status: 'offline' as const, label: '部分任务保存失败' }
    }
    if (todos.value.some((todo) => todo.saveState === 'dirty' || todo.saveState === 'saving')) {
      return { status: 'checking' as const, label: '正在保存任务' }
    }
    if (listState.value === 'loading') return { status: 'checking' as const, label: '正在加载任务' }
    return { status: 'online' as const, label: '任务已保存在本机' }
  })

  function clearSaveTimer(id: string) {
    const timer = saveTimers.get(id)
    if (timer) globalThis.clearTimeout(timer)
    saveTimers.delete(id)
  }

  function snapshot(todo: TodoDraft): TodoUpdateInput {
    return {
      title: todo.title.trim(),
      content: serializeTodoContent(todo.description, todo.checklist),
      status: todo.status,
      remindAt: todo.remindAt,
    }
  }

  function enqueueSave(id: string, force = false) {
    const todo = todos.value.find((item) => item.id === id)
    if (!todo) return Promise.resolve()
    const revision = todo.revision
    if (!force && revision <= todo.savedRevision && todo.saveState !== 'error') return Promise.resolve()
    if (!todo.title.trim()) {
      todo.saveState = 'error'
      todo.saveError = '任务标题不能为空'
      return Promise.resolve()
    }

    const previous = saveQueues.get(id) ?? Promise.resolve()
    const input = snapshot(todo)
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        todo.saveState = 'saving'
        todo.saveError = ''
        try {
          const record = await services.update(id, input)
          todo.title = record.title
          todo.content = record.content
          todo.status = record.status
          todo.remindAt = record.remindAt
          todo.updatedAt = record.updatedAt
          todo.savedRevision = Math.max(todo.savedRevision, revision)
          todo.lastSavedAt = now()
          todo.saveState = todo.revision > revision ? 'dirty' : 'saved'
        } catch (reason) {
          if (todo.revision > revision) todo.saveState = 'dirty'
          else {
            todo.saveState = 'error'
            todo.saveError = errorMessage(reason, '任务保存失败，请稍后重试')
          }
        }
      })
      .finally(() => {
        if (saveQueues.get(id) === task) saveQueues.delete(id)
      })
    saveQueues.set(id, task)
    return task
  }

  function scheduleSave(todo: TodoDraft) {
    clearSaveTimer(todo.id)
    saveTimers.set(todo.id, globalThis.setTimeout(() => {
      saveTimers.delete(todo.id)
      void enqueueSave(todo.id)
    }, saveDelay))
  }

  function markDirty(todo: TodoDraft) {
    todo.revision += 1
    todo.saveState = 'dirty'
    todo.saveError = ''
    todo.content = serializeTodoContent(todo.description, todo.checklist)
    scheduleSave(todo)
  }

  function updateCurrent(field: 'title' | 'description' | 'remindAt', value: string) {
    const todo = currentTodo.value
    if (!todo || todo[field] === value) return
    todo[field] = value
    markDirty(todo)
  }

  function updateChecklist(index: number, patch: Partial<Pick<TodoChecklistItem, 'text' | 'done'>>) {
    const todo = currentTodo.value
    const item = todo?.checklist[index]
    if (!todo || !item) return
    Object.assign(item, patch)
    markDirty(todo)
  }

  function addChecklist(index?: number) {
    const todo = currentTodo.value
    if (!todo) return
    const nextIndex = index === undefined ? todo.checklist.length : index + 1
    todo.checklist.splice(nextIndex, 0, {
      id: createChecklistId(),
      text: '',
      done: false,
    })
    markDirty(todo)
    return nextIndex
  }

  function removeChecklist(index: number) {
    const todo = currentTodo.value
    if (!todo || !todo.checklist[index]) return
    todo.checklist.splice(index, 1)
    markDirty(todo)
  }

  async function setStatus(status: TodoStatus) {
    const todo = currentTodo.value
    if (!todo || todo.status === status) return
    todo.status = status
    if (status === 'done') todo.checklist.forEach((item) => { item.done = true })
    markDirty(todo)
    clearSaveTimer(todo.id)
    await enqueueSave(todo.id)
  }

  async function flushTodo(id: string) {
    clearSaveTimer(id)
    await enqueueSave(id)
  }

  async function flushCurrent() {
    if (currentId.value) await flushTodo(currentId.value)
  }

  async function flushAll() {
    await Promise.all(todos.value
      .filter((todo) => todo.revision > todo.savedRevision || todo.saveState === 'error')
      .map((todo) => flushTodo(todo.id)))
  }

  async function load(force = false) {
    if (!force && initialized.value && listState.value === 'loaded') return
    const version = ++loadVersion
    loadController.value?.abort()
    const controller = new AbortController()
    loadController.value = controller
    listState.value = 'loading'
    listError.value = ''
    try {
      await flushAll()
      const records = await services.list(controller.signal)
      if (controller.signal.aborted || version !== loadVersion) return
      todos.value = records.map(toDraft)
      listState.value = 'loaded'
      initialized.value = true
      if (!currentId.value || !todos.value.some((todo) => todo.id === currentId.value)) {
        currentId.value = todos.value[0]?.id ?? ''
      }
    } catch (reason) {
      if (controller.signal.aborted || version !== loadVersion) return
      listState.value = 'error'
      listError.value = errorMessage(reason, '任务列表加载失败，请稍后重试')
    } finally {
      if (version === loadVersion) loadController.value = null
    }
  }

  async function start() {
    if (initialized.value) return
    if (!startPromise) {
      startPromise = load(true).finally(() => { startPromise = null })
    }
    await startPromise
  }

  async function selectTodo(id: string) {
    if (!id || id === currentId.value) return
    await flushCurrent()
    currentId.value = id
  }

  async function create(input: TodoCreateInput) {
    await flushCurrent()
    const record = await services.create({
      ...input,
      title: input.title.trim(),
      content: input.content ?? '',
      remindAt: input.remindAt ?? '',
    })
    const todo = toDraft(record)
    todos.value.unshift(todo)
    currentId.value = todo.id
    return todo
  }

  async function removeCurrent() {
    const id = currentId.value
    if (!id) return
    clearSaveTimer(id)
    await services.remove(id)
    const index = todos.value.findIndex((todo) => todo.id === id)
    todos.value = todos.value.filter((todo) => todo.id !== id)
    currentId.value = todos.value[index]?.id ?? todos.value[index - 1]?.id ?? ''
  }

  async function clearCompleted() {
    const selectedWasCompleted = currentTodo.value?.status === 'done'
    const deleted = await services.clearCompleted()
    todos.value = todos.value.filter((todo) => todo.status !== 'done')
    if (selectedWasCompleted) currentId.value = todos.value[0]?.id ?? ''
    return deleted
  }

  function toggleGroup(status: TodoStatus) {
    collapsed[status] = !collapsed[status]
  }

  function hasIncompleteChecklist(todo = currentTodo.value) {
    return Boolean(todo?.checklist.some((item) => !item.done))
  }

  if (options.lifecycle !== false) {
    onMounted(() => void start())
    onActivated(() => void start())
    onDeactivated(() => void flushAll())
    onBeforeUnmount(() => {
      loadController.value?.abort()
      saveTimers.forEach((timer) => globalThis.clearTimeout(timer))
      saveTimers.clear()
      void flushAll()
    })
  }

  return {
    todos,
    visibleTodos,
    groups,
    currentId,
    currentTodo,
    search,
    filter,
    collapsed,
    listState,
    listError,
    completedCount,
    globalStatus,
    load,
    selectTodo,
    create,
    removeCurrent,
    clearCompleted,
    updateCurrent,
    updateChecklist,
    addChecklist,
    removeChecklist,
    setStatus,
    toggleGroup,
    hasIncompleteChecklist,
    flushCurrent,
    flushAll,
    retryCurrentSave: () => currentId.value ? enqueueSave(currentId.value, true) : Promise.resolve(),
  }
}
