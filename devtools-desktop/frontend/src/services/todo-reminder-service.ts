import { listTodos } from '@/services/modules/todo-service'
import { sendDesktopNotification } from '@/services/desktop-notification'
import { todoNotificationBody } from '@/views/todo/todo-content'

const REMINDED_STORAGE_KEY = 'devtools-reminded-todos'
const REMINDER_LIMIT = 200
const INITIAL_DELAY = 3_000
const CHECK_INTERVAL = 30_000

type DesktopNotificationBridge = typeof sendDesktopNotification

interface TodoReminderOptions {
  storage?: Storage
  now?: () => number
  notify?: DesktopNotificationBridge
}

function readRemindedIds(storage: Storage) {
  try {
    const parsed = JSON.parse(storage.getItem(REMINDED_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set<string>()
  }
}

export function createTodoReminderService(options: TodoReminderOptions = {}) {
  const storage = options.storage ?? window.localStorage
  const now = options.now ?? Date.now
  const remindedIds = readRemindedIds(storage)
  let initialTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let checking = false

  function saveRemindedIds() {
    const ids = [...remindedIds].slice(-REMINDER_LIMIT)
    remindedIds.clear()
    ids.forEach((id) => remindedIds.add(id))
    storage.setItem(REMINDED_STORAGE_KEY, JSON.stringify(ids))
  }

  async function check() {
    if (checking) return
    checking = true
    try {
      const todos = await listTodos()
      for (const todo of todos) {
        if (!todo.remindAt || todo.status === 'done' || remindedIds.has(todo.id)) continue
        const remindTime = new Date(todo.remindAt).getTime()
        if (!Number.isFinite(remindTime) || remindTime > now()) continue

        remindedIds.add(todo.id)
        saveRemindedIds()
        const notify = options.notify ?? sendDesktopNotification
        await notify('待办提醒', todoNotificationBody(todo.title, todo.content), false, { target: 'log' })
      }
    } catch {
      // Sidecar may still be starting; the next interval will retry.
    } finally {
      checking = false
    }
  }

  function start() {
    if (initialTimer || intervalTimer) return
    initialTimer = globalThis.setTimeout(() => {
      initialTimer = null
      void check()
    }, INITIAL_DELAY)
    intervalTimer = globalThis.setInterval(() => void check(), CHECK_INTERVAL)
  }

  function stop() {
    if (initialTimer) globalThis.clearTimeout(initialTimer)
    if (intervalTimer) globalThis.clearInterval(intervalTimer)
    initialTimer = null
    intervalTimer = null
  }

  return { check, start, stop }
}
