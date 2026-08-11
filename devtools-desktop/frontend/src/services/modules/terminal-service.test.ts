import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  listTerminalSessions,
  normalizeTerminalSession,
} from './terminal-service'

describe('terminal service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes session rows', () => {
    expect(normalizeTerminalSession({
      id: 'term-1',
      name: 'Terminal 1',
      cwd: null,
      nodeVersion: undefined,
      sortOrder: '3',
    })).toEqual({
      id: 'term-1',
      name: 'Terminal 1',
      cwd: '',
      nodeVersion: '',
      sortOrder: 3,
    })
  })

  it('lists sessions through the API client', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValueOnce([
      { id: 'term-1', name: 'Terminal 1', cwd: '', sortOrder: 1 },
    ] as never)

    await expect(listTerminalSessions()).resolves.toHaveLength(1)
    expect(request).toHaveBeenCalledWith('/api/terminal/sessions', {
      timeout: 15_000,
      signal: undefined,
    })
  })
})
