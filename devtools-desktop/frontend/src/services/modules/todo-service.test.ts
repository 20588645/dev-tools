import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  clearCompletedTodos,
  createTodo,
  listTodos,
  normalizeTodoRecord,
  updateTodo,
} from './todo-service'

describe('todo service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes nullable SQLite values and unknown statuses', () => {
    expect(normalizeTodoRecord({
      id: 'todo-1',
      title: null,
      content: null,
      status: 'unexpected',
      remindAt: null,
    })).toMatchObject({
      id: 'todo-1',
      title: '',
      content: '',
      status: 'todo',
      remindAt: '',
    })
  })

  it('passes abort ownership through the list boundary', async () => {
    const controller = new AbortController()
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue([{
      id: 'todo-1',
      title: '迁移待办',
      status: 'doing',
    }] as never)

    await expect(listTodos(controller.signal)).resolves.toMatchObject([
      { id: 'todo-1', status: 'doing' },
    ])
    expect(request).toHaveBeenCalledWith('/api/todos', {
      timeout: 15_000,
      signal: controller.signal,
    })
  })

  it('writes only the existing todo create and update contracts', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'todo-1', status: 'todo' } as never)
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ id: 'todo-1', status: 'done' } as never)

    await createTodo({ title: '新任务' })
    await updateTodo('todo-1', { status: 'done', remindAt: '' })

    expect(post).toHaveBeenCalledWith('/api/todos', {
      title: '新任务',
      content: '',
      status: 'todo',
      remindAt: '',
    }, 15_000)
    expect(put).toHaveBeenCalledWith('/api/todos/todo-1', {
      status: 'done',
      remindAt: '',
    }, 15_000)
  })

  it('returns the number deleted by clear completed', async () => {
    vi.spyOn(apiClient, 'delete').mockResolvedValue({ success: true, deleted: '3' } as never)
    await expect(clearCompletedTodos()).resolves.toBe(3)
  })
})
