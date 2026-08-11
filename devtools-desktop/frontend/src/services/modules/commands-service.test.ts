import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  listCommands,
  normalizeCommandRecord,
  normalizeSudoStatus,
} from './commands-service'

describe('commands service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes command rows and sudo status', () => {
    expect(normalizeCommandRecord({
      id: 'cmd-1',
      name: 'Kill port',
      command: 'kill ${port}',
      icon: null,
      hasParam: 1,
      paramName: 'port',
      paramPlaceholder: null,
      paramDefault: '3000',
      sortOrder: '2',
    })).toMatchObject({
      id: 'cmd-1',
      name: 'Kill port',
      command: 'kill ${port}',
      icon: '⚡',
      hasParam: true,
      paramName: 'port',
      paramPlaceholder: '',
      paramDefault: '3000',
      sortOrder: 2,
    })

    expect(normalizeSudoStatus({ configured: 1 })).toEqual({ configured: true })
    expect(normalizeSudoStatus({ configured: false })).toEqual({ configured: false })
  })

  it('lists commands through the API client', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValueOnce([
      { id: 'c1', name: 'A', command: 'echo', hasParam: 0 },
    ] as never)

    await expect(listCommands()).resolves.toHaveLength(1)
    expect(request).toHaveBeenCalledWith('/api/commands', {
      timeout: 15_000,
      signal: undefined,
    })
  })
})
