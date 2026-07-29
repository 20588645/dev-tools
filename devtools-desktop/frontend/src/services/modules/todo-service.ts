import { apiClient } from '@/services/api-client'

const TODO_TIMEOUT = 15_000

export const TODO_STATUSES = ['todo', 'doing', 'done'] as const
export type TodoStatus = typeof TODO_STATUSES[number]

interface TodoRawRecord {
  id?: unknown
  title?: unknown
  content?: unknown
  status?: unknown
  remindAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export interface TodoRecord {
  id: string
  title: string
  content: string
  status: TodoStatus
  remindAt: string
  createdAt: string
  updatedAt: string
}

export interface TodoCreateInput {
  title: string
  content?: string
  status?: TodoStatus
  remindAt?: string
}

export interface TodoUpdateInput {
  title?: string
  content?: string
  status?: TodoStatus
  remindAt?: string
}

function stringValue(value: unknown) {
  return String(value ?? '')
}

export function normalizeTodoStatus(value: unknown): TodoStatus {
  return TODO_STATUSES.includes(value as TodoStatus) ? value as TodoStatus : 'todo'
}

export function normalizeTodoRecord(value: TodoRawRecord): TodoRecord {
  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    content: stringValue(value.content),
    status: normalizeTodoStatus(value.status),
    remindAt: stringValue(value.remindAt),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  }
}

export async function listTodos(signal?: AbortSignal): Promise<TodoRecord[]> {
  const value = await apiClient.request<TodoRawRecord[]>('/api/todos', {
    timeout: TODO_TIMEOUT,
    signal,
  })
  return Array.isArray(value) ? value.map(normalizeTodoRecord) : []
}

export async function createTodo(input: TodoCreateInput): Promise<TodoRecord> {
  const value = await apiClient.post<TodoRawRecord>('/api/todos', {
    title: input.title,
    content: input.content ?? '',
    status: input.status ?? 'todo',
    remindAt: input.remindAt ?? '',
  }, TODO_TIMEOUT)
  return normalizeTodoRecord(value)
}

export async function updateTodo(id: string, input: TodoUpdateInput): Promise<TodoRecord> {
  const value = await apiClient.put<TodoRawRecord>(`/api/todos/${encodeURIComponent(id)}`, input, TODO_TIMEOUT)
  return normalizeTodoRecord(value)
}

export async function deleteTodo(id: string): Promise<void> {
  await apiClient.delete(`/api/todos/${encodeURIComponent(id)}`, undefined, TODO_TIMEOUT)
}

export async function clearCompletedTodos(): Promise<number> {
  const value = await apiClient.delete<{ deleted?: unknown }>('/api/todos', undefined, TODO_TIMEOUT)
  const deleted = Number(value?.deleted)
  return Number.isFinite(deleted) ? deleted : 0
}
