import { apiClient } from '@/services/api-client'

const EDITOR_TIMEOUT = 15_000

export type EditorEol = 'LF' | 'CRLF'

export interface EditorDraftRecord {
  id: string
  title: string
  content: string
  sortOrder: number
  updatedAt?: string
}

export interface EditorBrowseEntry {
  name: string
  path: string
  isDir: boolean
  size?: number
}

export interface EditorBrowseResult {
  currentDir: string
  parent: string | null
  home: string
  entries: EditorBrowseEntry[]
}

export interface EditorFileReadResult {
  path: string
  name: string
  ext: string
  content: string
  size: number
  eol: EditorEol
  mtime: number
}

export interface EditorFileWriteResult {
  ok: boolean
  size: number
  mtime: number
}

interface DraftRaw {
  id?: unknown
  title?: unknown
  content?: unknown
  sortOrder?: unknown
  updatedAt?: unknown
}

interface BrowseRaw {
  currentDir?: unknown
  parent?: unknown
  home?: unknown
  entries?: unknown
}

interface ReadRaw {
  path?: unknown
  name?: unknown
  ext?: unknown
  content?: unknown
  size?: unknown
  eol?: unknown
  mtime?: unknown
}

interface WriteRaw {
  ok?: unknown
  size?: unknown
  mtime?: unknown
}

const stringValue = (value: unknown) => String(value ?? '')
const numberValue = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeDraftRecord(value: DraftRaw): EditorDraftRecord {
  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    content: stringValue(value.content),
    sortOrder: numberValue(value.sortOrder),
    updatedAt: value.updatedAt == null ? undefined : stringValue(value.updatedAt),
  }
}

export function normalizeBrowseResult(value: BrowseRaw): EditorBrowseResult {
  const entriesRaw = Array.isArray(value.entries) ? value.entries : []
  return {
    currentDir: stringValue(value.currentDir),
    parent: value.parent == null || value.parent === '' ? null : stringValue(value.parent),
    home: stringValue(value.home),
    entries: entriesRaw.map((entry) => {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      return {
        name: stringValue(item.name),
        path: stringValue(item.path),
        isDir: Boolean(item.isDir),
        size: item.size == null ? undefined : numberValue(item.size),
      }
    }),
  }
}

export function normalizeFileRead(value: ReadRaw): EditorFileReadResult {
  const eol = stringValue(value.eol).toUpperCase() === 'CRLF' ? 'CRLF' : 'LF'
  return {
    path: stringValue(value.path),
    name: stringValue(value.name),
    ext: stringValue(value.ext).toLowerCase(),
    content: stringValue(value.content),
    size: numberValue(value.size),
    eol,
    mtime: numberValue(value.mtime),
  }
}

export function formatEditorSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function listEditorDrafts(signal?: AbortSignal): Promise<EditorDraftRecord[]> {
  const rows = await apiClient.request<DraftRaw[]>('/api/editor/drafts', {
    timeout: EDITOR_TIMEOUT,
    signal,
  })
  return (Array.isArray(rows) ? rows : []).map(normalizeDraftRecord)
}

export async function createEditorDraft(input: { title?: string; content?: string }): Promise<EditorDraftRecord> {
  const row = await apiClient.post<DraftRaw>('/api/editor/drafts', {
    title: input.title ?? '',
    content: input.content ?? '',
  }, EDITOR_TIMEOUT)
  return normalizeDraftRecord(row)
}

export async function updateEditorDraft(
  id: string,
  input: { title?: string; content?: string },
): Promise<EditorDraftRecord> {
  const row = await apiClient.put<DraftRaw>(`/api/editor/drafts/${encodeURIComponent(id)}`, input, EDITOR_TIMEOUT)
  return normalizeDraftRecord(row)
}

export async function deleteEditorDraft(id: string): Promise<void> {
  await apiClient.delete(`/api/editor/drafts/${encodeURIComponent(id)}`, undefined, EDITOR_TIMEOUT)
}

export async function browseEditorDir(dir?: string, signal?: AbortSignal): Promise<EditorBrowseResult> {
  const path = dir
    ? `/api/editor/browse?dir=${encodeURIComponent(dir)}`
    : '/api/editor/browse'
  const raw = await apiClient.request<BrowseRaw>(path, { timeout: EDITOR_TIMEOUT, signal })
  return normalizeBrowseResult(raw)
}

export async function readEditorFile(filePath: string): Promise<EditorFileReadResult> {
  const raw = await apiClient.post<ReadRaw>('/api/editor/read', { path: filePath }, EDITOR_TIMEOUT)
  return normalizeFileRead(raw)
}

export async function writeEditorFile(
  filePath: string,
  content: string,
  eol: EditorEol = 'LF',
): Promise<EditorFileWriteResult> {
  const raw = await apiClient.post<WriteRaw>('/api/editor/write', { path: filePath, content, eol }, EDITOR_TIMEOUT)
  return {
    ok: Boolean(raw?.ok),
    size: numberValue(raw?.size),
    mtime: numberValue(raw?.mtime),
  }
}
