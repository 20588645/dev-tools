import { apiClient } from '@/services/api-client'

const TERMINAL_TIMEOUT = 15_000

export interface TerminalSessionRecord {
  id: string
  name: string
  cwd: string
  nodeVersion: string
  sortOrder: number
}

export interface CreateTerminalSessionInput {
  id: string
  name: string
  cwd?: string
  nodeVersion?: string
}

interface SessionRaw {
  id?: unknown
  name?: unknown
  cwd?: unknown
  nodeVersion?: unknown
  sortOrder?: unknown
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 归一化终端会话行，对齐 sidecar `terminal_sessions`。 */
export function normalizeTerminalSession(value: unknown): TerminalSessionRecord {
  const row = record(value) as SessionRaw
  return {
    id: text(row.id),
    name: text(row.name),
    cwd: text(row.cwd),
    nodeVersion: text(row.nodeVersion),
    sortOrder: num(row.sortOrder),
  }
}

export async function listTerminalSessions(signal?: AbortSignal): Promise<TerminalSessionRecord[]> {
  const value = await apiClient.request<unknown>('/api/terminal/sessions', {
    timeout: TERMINAL_TIMEOUT,
    signal,
  })
  return Array.isArray(value) ? value.map(normalizeTerminalSession) : []
}

export async function createTerminalSession(
  input: CreateTerminalSessionInput,
  signal?: AbortSignal,
): Promise<{ success: boolean; id: string }> {
  const value = await apiClient.request<{ success?: boolean; id?: string }>('/api/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      cwd: input.cwd || '',
      nodeVersion: input.nodeVersion || '',
    }),
    timeout: TERMINAL_TIMEOUT,
    signal,
  })
  return {
    success: value?.success !== false,
    id: text(value?.id, input.id),
  }
}

export async function deleteTerminalSession(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.request(`/api/terminal/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    timeout: TERMINAL_TIMEOUT,
    signal,
  })
}
