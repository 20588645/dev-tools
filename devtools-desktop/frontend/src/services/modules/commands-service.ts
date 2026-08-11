import { apiClient } from '@/services/api-client'

const COMMANDS_TIMEOUT = 15_000

export interface CommandRecord {
  id: string
  name: string
  command: string
  icon: string
  hasParam: boolean
  paramName: string
  paramPlaceholder: string
  paramDefault: string
  sortOrder?: number
}

export interface SudoStatus {
  configured: boolean
}

export interface CreateCommandInput {
  name: string
  command: string
  icon?: string
  hasParam?: boolean
  paramName?: string
  paramPlaceholder?: string
  paramDefault?: string
}

interface CommandRaw {
  id?: unknown
  name?: unknown
  command?: unknown
  icon?: unknown
  hasParam?: unknown
  paramName?: unknown
  paramPlaceholder?: unknown
  paramDefault?: unknown
  sortOrder?: unknown
}

interface SudoStatusRaw {
  configured?: unknown
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

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

/** 归一化快捷命令行，对齐 sidecar `commands` 表布尔字段。 */
export function normalizeCommandRecord(value: unknown): CommandRecord {
  const row = record(value) as CommandRaw
  return {
    id: text(row.id),
    name: text(row.name),
    command: text(row.command),
    icon: text(row.icon, '⚡'),
    hasParam: bool(row.hasParam),
    paramName: text(row.paramName),
    paramPlaceholder: text(row.paramPlaceholder),
    paramDefault: text(row.paramDefault),
    sortOrder: row.sortOrder == null ? undefined : num(row.sortOrder),
  }
}

export function normalizeSudoStatus(value: unknown): SudoStatus {
  const row = record(value) as SudoStatusRaw
  return { configured: bool(row.configured) }
}

export async function listCommands(signal?: AbortSignal): Promise<CommandRecord[]> {
  const value = await apiClient.request<unknown>('/api/commands', {
    timeout: COMMANDS_TIMEOUT,
    signal,
  })
  return Array.isArray(value) ? value.map(normalizeCommandRecord) : []
}

export async function createCommand(input: CreateCommandInput, signal?: AbortSignal): Promise<CommandRecord> {
  const value = await apiClient.request<unknown>('/api/commands', {
    method: 'POST',
    body: JSON.stringify(input),
    timeout: COMMANDS_TIMEOUT,
    signal,
  })
  return normalizeCommandRecord(value)
}

export async function deleteCommand(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.request(`/api/commands/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    timeout: COMMANDS_TIMEOUT,
    signal,
  })
}

export async function getSudoStatus(signal?: AbortSignal): Promise<SudoStatus> {
  const value = await apiClient.request<unknown>('/api/commands/sudo-status', {
    timeout: COMMANDS_TIMEOUT,
    signal,
  })
  return normalizeSudoStatus(value)
}

export async function setSudoPassword(password: string, signal?: AbortSignal): Promise<SudoStatus> {
  const value = await apiClient.request<unknown>('/api/commands/sudo-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
    timeout: COMMANDS_TIMEOUT,
    signal,
  })
  return normalizeSudoStatus(value)
}
