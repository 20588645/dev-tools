import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { TodoRecord } from '@/services/modules/todo-service'
import { todoTiming, useTodo } from './useTodo'

const records: TodoRecord[] = [
  {
    id: 'todo-1',
    title: '迁移待办页',
    content: '保持历史数据\n[checklist]\n- [ ] 增加测试',
    status: 'todo',
    remindAt: '2026-07-29T09:00:00+08:00',
    createdAt: '2026-07-28T10:00:00+08:00',
    updatedAt: '2026-07-28T10:00:00+08:00',
  },
  {
    id: 'todo-2',
    title: '已完成任务',
    content: '',
    status: 'done',
    remindAt: '',
    createdAt: '2026-07-27T10:00:00+08:00',
    updatedAt: '2026-07-27T10:00:00+08:00',
  },
]

function services() {
  return {
    list: vi.fn().mockResolvedValue(records),
    create: vi.fn(),
    update: vi.fn().mockImplementation(async (id, input) => ({
      ...records.find((record) => record.id === id),
      ...input,
      id,
      updatedAt: '2026-07-29T10:00:00+08:00',
    })),
    remove: vi.fn(),
    clearCompleted: vi.fn().mockResolvedValue(1),
  }
}

describe('useTodo', () => {
  it('derives today and overdue from the existing reminder field', () => {
    const now = new Date('2026-07-29T08:30:00+08:00')
    expect(todoTiming(records[0], now)).toBe('today')
    expect(todoTiming({ ...records[0], remindAt: '2026-07-29T08:00:00+08:00' }, now)).toBe('overdue')
    expect(todoTiming({ ...records[0], status: 'done' }, now)).toBe('none')
  })

  it('loads, searches parsed checklist content and filters by completion state', async () => {
    const service = services()
    const controller = useTodo({
      services: service,
      now: () => new Date('2026-07-29T08:30:00+08:00'),
      lifecycle: false,
    })
    await controller.load(true)

    // 默认「进行中」视图不含已完成任务
    expect(controller.visibleTodos.value.map((todo) => todo.id)).toEqual(['todo-1'])
    expect(controller.activeCount.value).toBe(1)
    expect(controller.completedCount.value).toBe(1)
    expect(controller.todayDueCount.value).toBe(1)
    controller.filter.value = 'done'
    await nextTick()
    expect(controller.visibleTodos.value.map((todo) => todo.id)).toEqual(['todo-2'])
    controller.filter.value = 'all'
    await nextTick()
    // 「全部」视图把已完成压到底部
    expect(controller.visibleTodos.value.map((todo) => todo.id)).toEqual(['todo-1', 'todo-2'])

    controller.filter.value = 'active'
    expect(controller.currentTodo.value?.description).toBe('保持历史数据')
    controller.search.value = '增加测试'
    await nextTick()
    expect(controller.visibleTodos.value.map((todo) => todo.id)).toEqual(['todo-1'])
  })

  it('serializes checklist edits through the old content contract', async () => {
    const service = services()
    const controller = useTodo({ services: service, saveDelay: 0, lifecycle: false })
    await controller.load(true)

    controller.updateChecklist(0, { done: true })
    await controller.flushCurrent()

    expect(service.update).toHaveBeenCalledWith('todo-1', expect.objectContaining({
      content: '保持历史数据\n[checklist]\n- [x] 增加测试',
    }))
  })

  it('completes child items when the confirmed parent task is completed', async () => {
    const service = services()
    const controller = useTodo({ services: service, lifecycle: false })
    await controller.load(true)

    expect(controller.hasIncompleteChecklist()).toBe(true)
    await controller.setStatus('done')
    expect(controller.currentTodo.value?.checklist.every((item) => item.done)).toBe(true)
    expect(service.update).toHaveBeenCalledWith('todo-1', expect.objectContaining({ status: 'done' }))
  })
})
