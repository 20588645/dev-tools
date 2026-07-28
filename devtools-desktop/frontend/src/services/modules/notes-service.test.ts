import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiClient } from '@/services/api-client'
import { getNoteByDate, normalizeNoteRecord, saveNote } from './notes-service'

describe('notes service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes the legacy SQLite record at the service boundary', () => {
    expect(normalizeNoteRecord({
      date: '2026-07-27',
      title: null,
      content: '完成迁移',
      updatedAt: '2026-07-27T08:00:00.000Z',
    })).toEqual({
      date: '2026-07-27',
      title: '',
      content: '完成迁移',
      createdAt: '',
      updatedAt: '2026-07-27T08:00:00.000Z',
    })
  })

  it('treats only a 404 as an empty date', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValue(
      new ApiError('该日期没有日志', 'http', { status: 404 }),
    )

    await expect(getNoteByDate('2026-07-27')).resolves.toBeNull()
  })

  it('keeps network and server failures visible to the view', async () => {
    const networkError = new ApiError('无法连接 Sidecar 服务', 'network')
    vi.spyOn(apiClient, 'request').mockRejectedValue(networkError)

    await expect(getNoteByDate('2026-07-27')).rejects.toBe(networkError)
  })

  it('writes the existing date, title and content contract', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      date: '2026-07-27',
      title: 'Notes Vue 迁移',
      content: '完成 service',
    } as never)

    await expect(saveNote({
      date: '2026-07-27',
      title: 'Notes Vue 迁移',
      content: '完成 service',
    })).resolves.toMatchObject({
      date: '2026-07-27',
      title: 'Notes Vue 迁移',
      content: '完成 service',
    })
    expect(post).toHaveBeenCalledWith('/api/notes', {
      date: '2026-07-27',
      title: 'Notes Vue 迁移',
      content: '完成 service',
    }, 15_000)
  })
})
