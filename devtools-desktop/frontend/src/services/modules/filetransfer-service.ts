import { apiClient } from '@/services/api-client'

const FT_TIMEOUT = 30_000

export type TransferDirection = 'upload' | 'download'
export type ConflictPolicy = 'overwrite' | 'skip' | 'rename'

export interface FtFileItem {
  name: string
  path?: string
  size: number
  mtime: number
  isDir: boolean
  isSymlink: boolean
  isFile: boolean
  target?: string
  mode?: number | null
  perms?: string
  owner?: string
  group?: string
}

export interface FtListResult {
  path: string
  parent: string | null
  home?: string
  items: FtFileItem[]
}

export interface FtTransferItem {
  from: string
  to: string
  isDir?: boolean
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
  return value === true
}

/** 归一化本地 / 远程 list 条目，字段对齐 sidecar `fs` / `sftp` 契约。 */
export function normalizeFileItem(value: unknown): FtFileItem {
  const row = record(value)
  const isDir = bool(row.isDir)
  const isSymlink = bool(row.isSymlink)
  const target = text(row.target)
  return {
    name: text(row.name),
    path: text(row.path) || undefined,
    size: num(row.size),
    mtime: num(row.mtime),
    isDir,
    isSymlink,
    isFile: bool(row.isFile) || (!isDir && !isSymlink),
    target: target || undefined,
    mode: row.mode == null ? null : num(row.mode),
    perms: text(row.perms) || undefined,
    owner: text(row.owner) || undefined,
    group: text(row.group) || undefined,
  }
}

function normalizeListResult(value: unknown): FtListResult {
  const row = record(value)
  const items = Array.isArray(row.items) ? row.items.map(normalizeFileItem) : []
  return {
    path: text(row.path),
    parent: row.parent == null || row.parent === '' ? null : text(row.parent),
    home: text(row.home) || undefined,
    items,
  }
}

export async function connectSftp(serverId: string, timeoutMs: number): Promise<{ sessionId: string }> {
  const row = await apiClient.post<{ sessionId?: string }>('/api/sftp/connect', { serverId }, timeoutMs)
  const sessionId = text(row?.sessionId)
  if (!sessionId) throw new Error('连接成功但未返回 sessionId')
  return { sessionId }
}

export async function disconnectSftp(sessionId: string): Promise<void> {
  await apiClient.post('/api/sftp/disconnect', { sessionId }, FT_TIMEOUT)
}

export async function keepaliveSftp(sessionId: string): Promise<void> {
  await apiClient.post(`/api/sftp/${encodeURIComponent(sessionId)}/keepalive`, undefined, FT_TIMEOUT)
}

export async function listRemote(sessionId: string, path: string): Promise<FtListResult> {
  const q = encodeURIComponent(path || '.')
  const row = await apiClient.get<unknown>(`/api/sftp/${encodeURIComponent(sessionId)}/list?path=${q}`, FT_TIMEOUT)
  return normalizeListResult(row)
}

export async function mkdirRemote(sessionId: string, path: string): Promise<void> {
  await apiClient.post(`/api/sftp/${encodeURIComponent(sessionId)}/mkdir`, { path }, FT_TIMEOUT)
}

export async function renameRemote(sessionId: string, from: string, to: string): Promise<void> {
  await apiClient.post(`/api/sftp/${encodeURIComponent(sessionId)}/rename`, { from, to }, FT_TIMEOUT)
}

export async function deleteRemote(sessionId: string, path: string, recursive: boolean): Promise<void> {
  await apiClient.post(`/api/sftp/${encodeURIComponent(sessionId)}/delete`, { path, recursive }, FT_TIMEOUT)
}

export async function startTransfer(
  sessionId: string,
  payload: { direction: TransferDirection; items: FtTransferItem[]; onConflict: ConflictPolicy },
): Promise<{ taskId: string }> {
  const row = await apiClient.post<{ taskId?: string }>(
    `/api/sftp/${encodeURIComponent(sessionId)}/transfer`,
    payload,
    FT_TIMEOUT,
  )
  const taskId = text(row?.taskId)
  if (!taskId) throw new Error('传输已入队但未返回 taskId')
  return { taskId }
}

export async function cancelTransfer(taskId: string): Promise<void> {
  await apiClient.post(`/api/sftp/transfer/${encodeURIComponent(taskId)}/cancel`, undefined, FT_TIMEOUT)
}

export async function listLocal(path: string): Promise<FtListResult> {
  const q = encodeURIComponent(path || '')
  const row = await apiClient.get<unknown>(`/api/fs/local/list?path=${q}`, FT_TIMEOUT)
  return normalizeListResult(row)
}

export async function mkdirLocal(path: string): Promise<void> {
  await apiClient.post('/api/fs/local/mkdir', { path }, FT_TIMEOUT)
}

export async function renameLocal(from: string, to: string): Promise<void> {
  await apiClient.post('/api/fs/local/rename', { from, to }, FT_TIMEOUT)
}

export async function deleteLocal(path: string, recursive: boolean): Promise<void> {
  await apiClient.post('/api/fs/local/delete', { path, recursive }, FT_TIMEOUT)
}

/** 本地路径拼接（mac 用 /，后端 path.resolve 兜底）。 */
export function joinLocal(dir: string, name: string): string {
  if (!dir) return name
  return (dir.endsWith('/') ? dir : `${dir}/`) + name
}

export function joinPosix(dir: string, name: string): string {
  if (!dir || dir === '/') return `/${name}`
  return (dir.endsWith('/') ? dir : `${dir}/`) + name
}

export function dirnamePosix(path: string): string {
  if (!path || path === '/') return '/'
  const trimmed = path.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i)
}

export function splitPathInput(value: string): { dir: string; prefix: string } {
  const v = value || ''
  const i = v.lastIndexOf('/')
  if (i < 0) return { dir: '', prefix: v }
  return { dir: v.slice(0, i) || '/', prefix: v.slice(i + 1) }
}

export function formatSize(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`
}

export function formatTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatEta(sec: number): string {
  if (!sec || sec < 0) return '0s'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}
