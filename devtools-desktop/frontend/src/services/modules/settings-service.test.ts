import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  DEFAULT_MENU_ORDER,
  getBackups,
  getHealth,
  normalizeBackupSnapshot,
  normalizeHealthInfo,
  readMenuOrder,
  writeMenuOrder,
} from './settings-service'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

vi.mock('@/services/api-client', () => ({
  apiClient: {
    request: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes health and backup payloads without trusting malformed values', () => {
    expect(normalizeHealthInfo({
      status: 'ok',
      uptime: '120',
      pid: '48102',
      version: '0.1.93',
      dataDir: '/tmp/data-test',
    })).toEqual({
      status: 'ok',
      uptime: 120,
      pid: 48102,
      version: '0.1.93',
      dataDir: '/tmp/data-test',
    })

    expect(normalizeBackupSnapshot({
      pendingRestore: true,
      backups: [
        { file: 'older.db', size: '1024', createdAt: 10 },
        { file: 'newer.db', size: 2048, createdAt: 20 },
        { file: '', size: 1, createdAt: 30 },
      ],
    })).toEqual({
      pendingRestore: true,
      backups: [
        { file: 'newer.db', size: 2048, createdAt: 20 },
        { file: 'older.db', size: 1024, createdAt: 10 },
      ],
    })
  })

  it('uses the shared API client and forwards request cancellation', async () => {
    const controller = new AbortController()
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ status: 'ok', pid: 100 })
      .mockResolvedValueOnce({ backups: [], pendingRestore: false })

    await getHealth(controller.signal)
    await getBackups(controller.signal)

    expect(apiClient.request).toHaveBeenNthCalledWith(1, '/api/health', { signal: controller.signal })
    expect(apiClient.request).toHaveBeenNthCalledWith(2, '/api/backup/list', { signal: controller.signal })
  })

  it('repairs incomplete menu order and persists only the sortable sequence', () => {
    const storage = createStorage()
    storage.setItem('devtools-menu-order', JSON.stringify(['notes', 'run', 'notes', 'unknown']))
    const order = readMenuOrder(storage)

    expect(order.slice(0, 2)).toEqual(['notes', 'run'])
    expect(order).toHaveLength(DEFAULT_MENU_ORDER.length)
    expect(new Set(order).size).toBe(DEFAULT_MENU_ORDER.length)

    writeMenuOrder(order, storage)
    expect(JSON.parse(storage.getItem('devtools-menu-order') ?? '[]')).toEqual(order)
  })
})
