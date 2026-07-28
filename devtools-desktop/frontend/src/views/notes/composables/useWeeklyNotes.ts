import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  type ComputedRef,
} from 'vue'

import {
  getNoteByDate,
  saveNote,
  type NoteRecord,
  type NoteWriteInput,
} from '@/services/modules/notes-service'

export type NoteLoadState = 'idle' | 'loading' | 'loaded' | 'error'
export type NoteSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface DailyNoteState {
  date: string
  title: string
  content: string
  loadState: NoteLoadState
  loadError: string
  saveState: NoteSaveState
  saveError: string
  revision: number
  savedRevision: number
  lastSavedAt: Date | null
}

export interface WeekDayEntry {
  date: string
  weekday: string
  shortWeekday: string
  dayNumber: string
  monthDay: string
  fullDate: string
  isToday: boolean
  isWeekend: boolean
  note: DailyNoteState
}

interface WeeklyNotesOptions {
  now?: () => Date
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  getNote?: (date: string, signal?: AbortSignal) => Promise<NoteRecord | null>
  persistNote?: (input: NoteWriteInput) => Promise<NoteRecord>
  saveDelay?: number
}

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEKEND_KEY = 'devtools-notes-show-weekend'

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function formatLocalDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getWeekDates(baseDate: Date, offset = 0) {
  const anchor = startOfLocalDay(baseDate)
  const day = anchor.getDay()
  const mondayDistance = day === 0 ? -6 : 1 - day
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() + mondayDistance + offset * 7)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return formatLocalDate(date)
  })
}

export function getIsoWeekNumber(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : String(reason || fallback)
}

function createDailyNote(date: string): DailyNoteState {
  return reactive({
    date,
    title: '',
    content: '',
    loadState: 'idle',
    loadError: '',
    saveState: 'idle',
    saveError: '',
    revision: 0,
    savedRevision: 0,
    lastSavedAt: null,
  })
}

export function hasNoteContent(note: Pick<DailyNoteState, 'title' | 'content'>) {
  return Boolean(note.title.trim() || note.content.trim())
}

export function noteSaveLabel(note: DailyNoteState) {
  if (note.saveState === 'dirty') return '等待保存'
  if (note.saveState === 'saving') return '正在保存'
  if (note.saveState === 'error') return '保存失败'
  if (note.saveState === 'saved' && note.lastSavedAt) {
    return `已保存 · ${note.lastSavedAt.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }
  if (note.saveState === 'saved') return '已保存'
  return '暂无内容'
}

export function useWeeklyNotes(options: WeeklyNotesOptions = {}) {
  const now = options.now ?? (() => new Date())
  const storage = options.storage ?? globalThis.localStorage
  const getNote = options.getNote ?? getNoteByDate
  const persistNote = options.persistNote ?? saveNote
  const saveDelay = options.saveDelay ?? 800
  const today = startOfLocalDay(now())
  const todayKey = formatLocalDate(today)
  const notesByDate = reactive<Record<string, DailyNoteState>>({})
  const weekOffset = ref(0)
  const showWeekend = ref(storage.getItem(WEEKEND_KEY) === 'true')
  const selectedDate = ref(todayKey)
  const initialized = ref(false)
  const loadController = ref<AbortController | null>(null)
  let loadVersion = 0

  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const saveQueues = new Map<string, Promise<void>>()
  const queuedRevisions = new Map<string, number>()

  const ensureNote = (date: string) => {
    if (!notesByDate[date]) notesByDate[date] = createDailyNote(date)
    return notesByDate[date]
  }

  const weekDates = computed(() => getWeekDates(today, weekOffset.value))
  const visibleDates = computed(() => showWeekend.value ? weekDates.value : weekDates.value.slice(0, 5))

  const days: ComputedRef<WeekDayEntry[]> = computed(() => visibleDates.value.map((date, index) => {
    const parsed = parseLocalDate(date)
    return {
      date,
      weekday: DAY_NAMES[index],
      shortWeekday: DAY_NAMES[index].slice(1),
      dayNumber: String(parsed.getDate()).padStart(2, '0'),
      monthDay: date.slice(5),
      fullDate: `${parsed.getFullYear()} 年 ${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日`,
      isToday: date === todayKey,
      isWeekend: index >= 5,
      note: ensureNote(date),
    }
  }))

  const selectedDay = computed(() => {
    const entry = days.value.find((day) => day.date === selectedDate.value)
      ?? days.value[0]
    return entry
  })

  const weekLabel = computed(() => {
    const [start, , , , , , end] = weekDates.value
    const prefix = weekOffset.value === 0 ? '本周 · ' : weekOffset.value === -1 ? '上周 · ' : ''
    return `${prefix}${start.slice(5)} — ${end.slice(5)}`
  })

  const weekCaption = computed(() => {
    const firstDate = parseLocalDate(weekDates.value[0])
    return `${firstDate.getFullYear()} 年第 ${getIsoWeekNumber(firstDate)} 周`
  })

  const contentDayCount = computed(() => days.value.filter((day) => hasNoteContent(day.note)).length)
  const globalStatus = computed(() => {
    const states = days.value.map((day) => day.note)
    if (states.some((note) => note.saveState === 'error')) {
      return { status: 'offline' as const, label: '部分内容保存失败' }
    }
    if (states.some((note) => note.loadState === 'error')) {
      return { status: 'offline' as const, label: '部分记录加载失败' }
    }
    if (states.some((note) => note.saveState === 'dirty' || note.saveState === 'saving')) {
      return { status: 'checking' as const, label: '正在保存本周内容' }
    }
    if (states.some((note) => note.loadState === 'loading' || note.loadState === 'idle')) {
      return { status: 'checking' as const, label: '正在载入本周记录' }
    }
    return { status: 'online' as const, label: '本周内容均已保存' }
  })

  const clearSaveTimer = (date: string) => {
    const timer = saveTimers.get(date)
    if (timer) globalThis.clearTimeout(timer)
    saveTimers.delete(date)
  }

  const enqueueSave = (date: string, force = false) => {
    const note = ensureNote(date)
    const revision = note.revision
    const existingQueue = saveQueues.get(date)
    if (!force && existingQueue && (queuedRevisions.get(date) ?? -1) >= revision) return existingQueue
    if (!force && revision <= note.savedRevision && note.saveState !== 'error') return Promise.resolve()

    const snapshot: NoteWriteInput = {
      date,
      title: note.title,
      content: note.content,
    }
    const previous = existingQueue ?? Promise.resolve()
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        note.saveState = 'saving'
        note.saveError = ''
        try {
          await persistNote(snapshot)
          note.savedRevision = Math.max(note.savedRevision, revision)
          note.lastSavedAt = now()
          note.saveState = note.revision > revision ? 'dirty' : 'saved'
        } catch (reason) {
          if (note.revision > revision) {
            note.saveState = 'dirty'
          } else {
            note.saveState = 'error'
            note.saveError = errorMessage(reason, '保存失败，请稍后重试')
          }
        }
      })
      .finally(() => {
        if (saveQueues.get(date) === task) {
          saveQueues.delete(date)
          queuedRevisions.delete(date)
        }
      })

    queuedRevisions.set(date, revision)
    saveQueues.set(date, task)
    return task
  }

  const flushDate = (date: string) => {
    clearSaveTimer(date)
    return enqueueSave(date)
  }

  const flushAll = () => Promise.all(
    Object.values(notesByDate)
      .filter((note) => note.revision > note.savedRevision || note.saveState === 'error')
      .map((note) => flushDate(note.date)),
  )

  const scheduleSave = (date: string) => {
    clearSaveTimer(date)
    saveTimers.set(date, globalThis.setTimeout(() => {
      saveTimers.delete(date)
      void enqueueSave(date)
    }, saveDelay))
  }

  const updateNote = (date: string, field: 'title' | 'content', value: string) => {
    const note = ensureNote(date)
    if (note[field] === value) return
    note[field] = value
    note.revision += 1
    note.saveState = 'dirty'
    note.saveError = ''
    scheduleSave(date)
  }

  const getNoteContent = (date: string) => ensureNote(date).content

  const canAcceptLoad = (note: DailyNoteState, revision: number) => (
    note.revision === revision
    && note.saveState !== 'dirty'
    && note.saveState !== 'saving'
    && note.saveState !== 'error'
  )

  const loadDate = async (date: string, version: number, controller: AbortController, force = false) => {
    const note = ensureNote(date)
    if (!force && (note.loadState === 'loaded' || !canAcceptLoad(note, note.revision))) return
    const initialRevision = note.revision
    note.loadState = 'loading'
    note.loadError = ''

    try {
      const record = await getNote(date, controller.signal)
      if (version !== loadVersion || controller.signal.aborted || !canAcceptLoad(note, initialRevision)) return
      note.title = record?.title ?? ''
      note.content = record?.content ?? ''
      note.loadState = 'loaded'
      note.loadError = ''
      note.revision = 0
      note.savedRevision = 0
      note.saveState = record ? 'saved' : 'idle'
      note.lastSavedAt = record?.updatedAt ? new Date(record.updatedAt) : null
    } catch (reason) {
      if (version !== loadVersion || controller.signal.aborted) return
      if (!canAcceptLoad(note, initialRevision)) return
      note.loadState = 'error'
      note.loadError = errorMessage(reason, '加载失败，请稍后重试')
      note.saveState = 'idle'
      note.lastSavedAt = null
    }
  }

  const loadCurrentWeek = async (force = false) => {
    const version = ++loadVersion
    loadController.value?.abort()
    const controller = new AbortController()
    loadController.value = controller
    await Promise.all(weekDates.value.map((date) => loadDate(date, version, controller, force)))
    if (version === loadVersion) loadController.value = null
  }

  const ensureLoaded = () => {
    if (initialized.value) return
    initialized.value = true
    void loadCurrentWeek()
  }

  const resume = () => {
    if (!initialized.value) {
      ensureLoaded()
      return
    }
    if (loadController.value) return
    const hasIncompleteLoad = weekDates.value.some((date) => {
      const state = ensureNote(date).loadState
      return state === 'idle' || state === 'loading' || state === 'error'
    })
    if (hasIncompleteLoad) void loadCurrentWeek()
  }

  const selectDate = (date: string) => {
    if (date === selectedDate.value) return
    void flushDate(selectedDate.value)
    selectedDate.value = date
  }

  const changeWeek = (delta: number) => {
    const oldDates = weekDates.value
    const selectedIndex = Math.max(0, oldDates.indexOf(selectedDate.value))
    void flushDate(selectedDate.value)
    weekOffset.value += delta
    selectedDate.value = weekDates.value[Math.min(selectedIndex, weekDates.value.length - 1)]
    void loadCurrentWeek()
  }

  const goToCurrentWeek = () => {
    if (weekOffset.value === 0) {
      selectedDate.value = todayKey
      return
    }
    void flushDate(selectedDate.value)
    weekOffset.value = 0
    selectedDate.value = todayKey
    void loadCurrentWeek()
  }

  const setShowWeekend = (value: boolean) => {
    showWeekend.value = value
    storage.setItem(WEEKEND_KEY, String(value))
    if (!value && selectedDay.value?.isWeekend) {
      void flushDate(selectedDate.value)
      selectedDate.value = weekDates.value[4]
    }
  }

  const retryLoad = () => {
    void loadCurrentWeek(true)
  }

  const retrySave = (date: string) => {
    clearSaveTimer(date)
    void enqueueSave(date, true)
  }

  const deactivate = () => {
    loadController.value?.abort()
    loadController.value = null
    void flushAll()
  }

  onMounted(ensureLoaded)
  onActivated(resume)
  onDeactivated(deactivate)
  onBeforeUnmount(() => {
    deactivate()
    saveTimers.forEach((timer) => globalThis.clearTimeout(timer))
    saveTimers.clear()
  })

  return {
    weekOffset,
    showWeekend,
    selectedDate,
    weekDates,
    visibleDates,
    days,
    selectedDay,
    weekLabel,
    weekCaption,
    contentDayCount,
    globalStatus,
    selectDate,
    changeWeek,
    goToCurrentWeek,
    setShowWeekend,
    updateNote,
    getNoteContent,
    flushDate,
    flushAll,
    loadCurrentWeek,
    retryLoad,
    retrySave,
  }
}
