import { apiClient } from '@/services/api-client'

const NOTEBOOK_TIMEOUT = 15_000
const NOTEBOOK_UPLOAD_TIMEOUT = 30_000
const NOTEBOOK_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const NOTEBOOK_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

interface NotebookRawRecord {
  id?: unknown
  title?: unknown
  content?: unknown
  preview?: unknown
  pinned?: unknown
  sortOrder?: unknown
  hasMedia?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export interface NotebookSummary {
  id: string
  title: string
  preview: string
  pinned: boolean
  sortOrder: number
  hasMedia: boolean
  createdAt: string
  updatedAt: string
}

export interface NotebookRecord extends NotebookSummary {
  content: string
}

export interface NotebookCreateInput {
  title?: string
  content?: string
}

export interface NotebookUpdateInput {
  title?: string
  content?: string
  pinned?: boolean
}

export interface NotebookImageUploadResult {
  url: string
}

const stringValue = (value: unknown) => String(value ?? '')
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const booleanValue = (value: unknown) => value === true || value === 1 || value === '1'

export function normalizeNotebookSummary(value: NotebookRawRecord): NotebookSummary {
  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    preview: stringValue(value.preview),
    pinned: booleanValue(value.pinned),
    sortOrder: numberValue(value.sortOrder),
    hasMedia: booleanValue(value.hasMedia),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  }
}

export function normalizeNotebookRecord(value: NotebookRawRecord): NotebookRecord {
  return {
    ...normalizeNotebookSummary(value),
    content: stringValue(value.content),
  }
}

export async function listNotebookNotes(search = '', signal?: AbortSignal): Promise<NotebookSummary[]> {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
  const value = await apiClient.request<NotebookRawRecord[]>(`/api/notebook${query}`, {
    timeout: NOTEBOOK_TIMEOUT,
    signal,
  })
  return Array.isArray(value) ? value.map(normalizeNotebookSummary) : []
}

export async function getNotebookNote(id: string, signal?: AbortSignal): Promise<NotebookRecord> {
  const value = await apiClient.request<NotebookRawRecord>(`/api/notebook/${encodeURIComponent(id)}`, {
    timeout: NOTEBOOK_TIMEOUT,
    signal,
  })
  return normalizeNotebookRecord(value)
}

export async function createNotebookNote(input: NotebookCreateInput = {}): Promise<NotebookRecord> {
  const value = await apiClient.post<NotebookRawRecord>('/api/notebook', {
    title: input.title ?? '',
    content: input.content ?? '',
  }, NOTEBOOK_TIMEOUT)
  return normalizeNotebookRecord(value)
}

export async function updateNotebookNote(id: string, input: NotebookUpdateInput): Promise<NotebookRecord> {
  const value = await apiClient.put<NotebookRawRecord>(`/api/notebook/${encodeURIComponent(id)}`, input, NOTEBOOK_TIMEOUT)
  return normalizeNotebookRecord(value)
}

export async function deleteNotebookNote(id: string): Promise<void> {
  await apiClient.delete(`/api/notebook/${encodeURIComponent(id)}`, undefined, NOTEBOOK_TIMEOUT)
}

export async function reorderNotebookNotes(ids: string[]): Promise<void> {
  await apiClient.put('/api/notebook/reorder', { ids }, NOTEBOOK_TIMEOUT)
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('图片数据格式无效'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}

export async function uploadNotebookImage(file: File): Promise<NotebookImageUploadResult> {
  if (!NOTEBOOK_IMAGE_TYPES.has(file.type)) {
    throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片')
  }
  if (!file.size || file.size > NOTEBOOK_IMAGE_MAX_BYTES) {
    throw new Error('图片不能超过 8MB')
  }
  const data = await readFileAsBase64(file)
  const value = await apiClient.post<{ url?: unknown }>('/api/notebook/upload', {
    data,
    filename: file.name || 'image',
    mimeType: file.type,
    size: file.size,
  }, NOTEBOOK_UPLOAD_TIMEOUT)
  return { url: stringValue(value.url) }
}

export async function resolveNotebookAssetUrl(path: string) {
  const baseUrl = await apiClient.initialize()
  return new URL(path, `${baseUrl}/`).href
}
