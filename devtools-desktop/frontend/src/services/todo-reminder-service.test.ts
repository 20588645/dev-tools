import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listTodos } from '@/services/modules/todo-service'
import { createTodoReminderService } from './todo-reminder-service'

vi.mock('@/services/modules/todo-service', () => ({
  listTodos: vi.fn(),
}))

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

describe('todo reminder service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(listTodos).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts only one application-level polling lifecycle', () => {
    const service = createTodoReminderService({ storage: createStorage() })
    service.start()
    service.start()

    expect(vi.getTimerCount()).toBe(2)
    service.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('notifies once by task id and strips checklist syntax from the body', async () => {
    const notify = vi.fn()
    const storage = createStorage()
    vi.mocked(listTodos).mockResolvedValue([{
      id: 'todo-1',
      title: '迁移待办',
      content: '正文\n[checklist]\n- [ ] 不应显示',
      status: 'todo',
      remindAt: '2026-07-29T00:00:00.000Z',
      createdAt: '',
      updatedAt: '',
    }])
    const service = createTodoReminderService({
      storage,
      notify,
      now: () => new Date('2026-07-29T12:00:00.000Z').getTime(),
    })

    await service.check()
    await service.check()

    expect(notify).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith('待办提醒', '迁移待办\n正文', false, { target: 'log' })
    expect(storage.getItem('devtools-reminded-todos')).toBe('["todo-1"]')
  })
})
