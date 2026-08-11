import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  browseEditorDir,
  formatEditorSize,
  listEditorDrafts,
  normalizeBrowseResult,
  normalizeDraftRecord,
  normalizeFileRead,
  writeEditorFile,
} from './editor-service'

describe('editor service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes drafts, browse entries and file reads', () => {
    expect(normalizeDraftRecord({
      id: 'draft-1',
      title: null,
      content: null,
      sortOrder: '2',
    })).toMatchObject({
      id: 'draft-1',
      title: '',
      content: '',
      sortOrder: 2,
    })

    expect(normalizeBrowseResult({
      currentDir: '/tmp',
      parent: '/',
      home: '/Users/me',
      entries: [{ name: 'a.txt', path: '/tmp/a.txt', isDir: 0, size: '12' }],
    }).entries[0]).toMatchObject({
      name: 'a.txt',
      path: '/tmp/a.txt',
      isDir: false,
      size: 12,
    })

    expect(normalizeFileRead({
      path: '/tmp/a.txt',
      name: 'a.txt',
      ext: 'TXT',
      content: 'hi',
      size: 2,
      eol: 'CRLF',
      mtime: 100,
    })).toMatchObject({
      ext: 'txt',
      eol: 'CRLF',
      mtime: 100,
    })
  })

  it('formats sizes like the legacy helper', () => {
    expect(formatEditorSize(500)).toBe('500 B')
    expect(formatEditorSize(2048)).toBe('2.0 KB')
    expect(formatEditorSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('lists drafts and browses directories through the API client', async () => {
    const request = vi.spyOn(apiClient, 'request')
      .mockResolvedValueOnce([{ id: 'd1', title: 't', content: 'c', sortOrder: 0 }] as never)
      .mockResolvedValueOnce({
        currentDir: '/tmp',
        parent: '/',
        home: '/Users/me',
        entries: [],
      } as never)

    await expect(listEditorDrafts()).resolves.toHaveLength(1)
    await expect(browseEditorDir('/tmp')).resolves.toMatchObject({ currentDir: '/tmp' })

    expect(request).toHaveBeenNthCalledWith(1, '/api/editor/drafts', {
      timeout: 15_000,
      signal: undefined,
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/editor/browse?dir=%2Ftmp', {
      timeout: 15_000,
      signal: undefined,
    })
  })

  it('writes files with eol preserved in the request body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      size: 3,
      mtime: 99,
    } as never)

    await expect(writeEditorFile('/tmp/a.txt', 'hi\n', 'CRLF')).resolves.toEqual({
      ok: true,
      size: 3,
      mtime: 99,
    })
    expect(post).toHaveBeenCalledWith('/api/editor/write', {
      path: '/tmp/a.txt',
      content: 'hi\n',
      eol: 'CRLF',
    }, 15_000)
  })
})
