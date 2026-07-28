import { ApiError, apiClient } from '@/services/api-client'

const NOTES_TIMEOUT = 15_000

interface NoteRawRecord {
  date?: unknown
  title?: unknown
  content?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export interface NoteRecord {
  date: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteWriteInput {
  date: string
  title: string
  content: string
}

const stringValue = (value: unknown) => String(value ?? '')

export function normalizeNoteRecord(value: NoteRawRecord): NoteRecord {
  return {
    date: stringValue(value.date),
    title: stringValue(value.title),
    content: stringValue(value.content),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  }
}

export async function getNoteByDate(date: string, signal?: AbortSignal): Promise<NoteRecord | null> {
  try {
    const value = await apiClient.request<NoteRawRecord>(`/api/notes/${encodeURIComponent(date)}`, {
      timeout: NOTES_TIMEOUT,
      signal,
    })
    return normalizeNoteRecord(value)
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 404) return null
    throw error
  }
}

export async function saveNote(input: NoteWriteInput): Promise<NoteRecord> {
  const value = await apiClient.post<NoteRawRecord>('/api/notes', input, NOTES_TIMEOUT)
  return normalizeNoteRecord(value)
}
