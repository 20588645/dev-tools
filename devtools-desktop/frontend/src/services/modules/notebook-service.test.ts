import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  listNotebookNotes,
  normalizeNotebookRecord,
  normalizeNotebookSummary,
  updateNotebookNote,
} from './notebook-service'

describe('notebook service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes SQLite booleans, order and nullable strings', () => {
    expect(normalizeNotebookSummary({
      id: 'note-1',
      title: null,
      pinned: 1,
      sortOrder: '3',
      hasMedia: 1,
    })).toMatchObject({
      id: 'note-1',
      title: '',
      pinned: true,
      sortOrder: 3,
      hasMedia: true,
    })

    expect(normalizeNotebookRecord({ id: 'note-1', content: null }).content).toBe('')
  })

  it('passes search and abort ownership through the API boundary', async () => {
    const controller = new AbortController()
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue([{
      id: 'note-1',
      title: 'Vue 迁移',
      preview: '个人笔记',
    }] as never)

    await expect(listNotebookNotes('Vue 迁移', controller.signal)).resolves.toHaveLength(1)
    expect(request).toHaveBeenCalledWith('/api/notebook?search=Vue%20%E8%BF%81%E7%A7%BB', {
      timeout: 15_000,
      signal: controller.signal,
    })
  })

  it('writes only the existing notebook update contract', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      id: 'note-1',
      title: '已更新',
      content: '<p>正文</p>',
      pinned: 0,
    } as never)

    await updateNotebookNote('note-1', {
      title: '已更新',
      content: '<p>正文</p>',
    })

    expect(put).toHaveBeenCalledWith('/api/notebook/note-1', {
      title: '已更新',
      content: '<p>正文</p>',
    }, 15_000)
  })
})
