import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetAppUpgradeForTest } from '@/composables/useAppUpgrade'
import * as settingsService from '@/services/modules/settings-service'
import { useSettings } from './useSettings'

vi.mock('@/services/api-client', () => ({
  apiClient: {
    baseURL: 'http://127.0.0.1:13900',
    request: vi.fn().mockResolvedValue({ connTimeoutSec: 60 }),
    put: vi.fn().mockResolvedValue({ connTimeoutSec: 60 }),
    setBaseUrl: vi.fn(),
  },
}))

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

function createService() {
  return {
    ...settingsService,
    getHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      uptime: 120,
      pid: 48102,
      version: '0.1.93',
      dataDir: '/tmp/data-test',
    }),
    getNodeRuntime: vi.fn().mockResolvedValue({ current: 'v20.19.0', versions: ['v20.19.0'] }),
    getBackups: vi.fn().mockResolvedValue({
      backups: [{ file: 'backup.db', size: 2048, createdAt: 1_722_240_000 }],
      pendingRestore: false,
    }),
    getTestSidecars: vi.fn().mockResolvedValue({ pids: [] }),
    getNotificationPermission: vi.fn().mockResolvedValue('granted' as const),
    createBackup: vi.fn().mockResolvedValue({ file: 'manual.db' }),
    startUpgrade: vi.fn().mockResolvedValue({ ok: true }),
  }
}

describe('useSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetAppUpgradeForTest()
    window.history.replaceState({}, '', '/?apiPort=13900')
  })

  it('loads independent setting domains and keeps the Git token local to the controller', async () => {
    const service = createService()
    const getReportConfig = vi.fn().mockResolvedValue({
      token: 'local-token',
      author: 'Ledy',
      outputDir: '',
      repos: [{ repo: 'https://gitlab.example/devtools.git', branch: 'main', group: 'desktop' }],
    })
    const controller = useSettings({
      service,
      getReportConfig,
      saveReportConfig: vi.fn(),
      storage: createStorage(),
      now: () => new Date('2026-07-29T12:00:00+08:00'),
    })

    await controller.initialize()

    expect(controller.health.value?.pid).toBe(48102)
    expect(controller.nodeRuntime.value?.current).toBe('v20.19.0')
    expect(controller.backups.value).toHaveLength(1)
    expect(controller.gitDraft.token).toBe('local-token')
    expect(controller.gitDirty.value).toBe(false)
    expect(controller.notificationLabel.value).toBe('已授权')
    controller.dispose()
  })

  it('tracks Git dirty state and persists a normalized repository list', async () => {
    const saveReportConfig = vi.fn().mockResolvedValue(undefined)
    const controller = useSettings({
      service: createService(),
      getReportConfig: vi.fn().mockResolvedValue({
        token: '',
        author: 'Ledy',
        outputDir: '',
        repos: [],
      }),
      saveReportConfig,
      storage: createStorage(),
    })
    await controller.initialize()

    controller.addRepository()
    controller.updateRepository(0, 'repo', 'https://gitlab.example/new.git')
    expect(controller.gitDirty.value).toBe(true)

    await controller.saveGitConfig()
    expect(saveReportConfig).toHaveBeenCalledWith({
      token: '',
      author: 'Ledy',
      outputDir: '',
      repos: [{ repo: 'https://gitlab.example/new.git', branch: '', group: '' }],
    })
    expect(controller.gitDirty.value).toBe(false)
    controller.dispose()
  })

  it('refreshes volatile status without overwriting an unsaved Git draft', async () => {
    const getReportConfig = vi.fn().mockResolvedValue({
      token: '',
      author: 'Ledy',
      outputDir: '',
      repos: [],
    })
    const controller = useSettings({
      service: createService(),
      getReportConfig,
      saveReportConfig: vi.fn(),
      storage: createStorage(),
    })
    await controller.initialize()
    controller.gitDraft.author = '尚未保存的作者'

    await controller.initialize(true)

    expect(controller.gitDraft.author).toBe('尚未保存的作者')
    expect(controller.gitDirty.value).toBe(true)
    expect(getReportConfig).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
