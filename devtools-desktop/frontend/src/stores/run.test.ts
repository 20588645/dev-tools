import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunJob } from '@/services/modules/run-service'

import { useRunStore } from './run'

vi.mock('@/services/modules/run-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/run-service')>(
    '@/services/modules/run-service',
  )
  return {
    ...actual,
    getRunStatuses: vi.fn(),
    getPortOwner: vi.fn(),
    startRun: vi.fn(),
    stopRun: vi.fn(),
    restartRun: vi.fn(),
    batchStopRun: vi.fn(),
  }
})

const service = await import('@/services/modules/run-service')
const getRunStatuses = vi.mocked(service.getRunStatuses)
const getPortOwner = vi.mocked(service.getPortOwner)
const restartRun = vi.mocked(service.restartRun)

const job = (overrides: Partial<RunJob> = {}): RunJob =>
  service.normalizeRunJob({ id: 'run-1', projectName: 'demo', status: 'running', ...overrides })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useRunStore.reconcile', () => {
  it('只把 starting/running 计入活跃任务', async () => {
    getRunStatuses.mockResolvedValue([
      job({ id: 'a', projectName: 'p-run', status: 'running' }),
      job({ id: 'b', projectName: 'p-start', status: 'starting' }),
      job({ id: 'c', projectName: 'p-stopped', status: 'stopped' }),
      job({ id: 'd', projectName: 'p-error', status: 'error' }),
      job({ id: 'e', projectName: 'p-stopping', status: 'stopping' }),
    ])
    const store = useRunStore()
    await store.reconcile()
    expect(store.runningProjectNames.sort()).toEqual(['p-run', 'p-start'])
    expect(store.runningCount).toBe(2)
  })

  it('对账失败时保留现有状态，不让运行中的服务从界面消失', async () => {
    const store = useRunStore()
    getRunStatuses.mockResolvedValue([job({ projectName: 'demo' })])
    await store.reconcile()
    expect(store.hasRunning).toBe(true)

    getRunStatuses.mockRejectedValue(new Error('network down'))
    const ok = await store.reconcile()
    expect(ok).toBe(false)
    expect(store.hasRunning).toBe(true)
  })

  it('对账后清掉已跑起来项目的端口告警', async () => {
    const store = useRunStore()
    store.portAlerts.demo = { port: 8080, pid: 1, pids: [1], user: 'u', command: 'node', commandPath: '/x/node' }
    getRunStatuses.mockResolvedValue([job({ projectName: 'demo' })])
    await store.reconcile()
    expect(store.alertOf('demo')).toBeNull()
  })

  it('记录对账时间戳', async () => {
    getRunStatuses.mockResolvedValue([])
    const store = useRunStore()
    expect(store.lastReconciledAt).toBe(0)
    await store.reconcile()
    expect(store.lastReconciledAt).toBeGreaterThan(0)
  })
})

describe('useRunStore.applyJob', () => {
  it('活跃推送写入并清除端口告警', () => {
    const store = useRunStore()
    store.portAlerts.demo = { port: 8080, pid: 1, pids: [1], user: 'u', command: 'node', commandPath: '/x' }
    const result = store.applyJob(job({ status: 'running' }))
    expect(result.active).toBe(true)
    expect(store.jobOf('demo')?.id).toBe('run-1')
    expect(store.alertOf('demo')).toBeNull()
  })

  it('非活跃推送移除任务', () => {
    const store = useRunStore()
    store.applyJob(job({ status: 'running' }))
    const result = store.applyJob(job({ status: 'stopped' }))
    expect(result.active).toBe(false)
    expect(store.jobOf('demo')).toBeNull()
  })

  it('stopping 视为非活跃（用于停止流程收尾）', () => {
    const store = useRunStore()
    store.applyJob(job({ status: 'running' }))
    expect(store.applyJob(job({ status: 'stopping' })).active).toBe(false)
  })
})

describe('useRunStore.diagnosePort', () => {
  it('占用时登记告警并带上完整路径', async () => {
    getPortOwner.mockResolvedValue({
      inUse: true, pid: 999, pids: [999], user: 'ldy', command: 'node', commandPath: '/usr/bin/node',
    })
    const store = useRunStore()
    const alert = await store.diagnosePort('demo', 8080)
    expect(alert?.pid).toBe(999)
    expect(alert?.commandPath).toBe('/usr/bin/node')
    expect(store.alertOf('demo')?.pid).toBe(999)
  })

  it('未占用时清掉旧告警', async () => {
    const store = useRunStore()
    store.portAlerts.demo = { port: 8080, pid: 1, pids: [1], user: '', command: '', commandPath: '' }
    getPortOwner.mockResolvedValue({ inUse: false })
    expect(await store.diagnosePort('demo', 8080)).toBeNull()
    expect(store.alertOf('demo')).toBeNull()
  })

  it('端口为空直接返回 null，不发请求', async () => {
    const store = useRunStore()
    expect(await store.diagnosePort('demo', '')).toBeNull()
    expect(getPortOwner).not.toHaveBeenCalled()
  })

  it('诊断失败不抛错', async () => {
    getPortOwner.mockRejectedValue(new Error('lsof missing'))
    const store = useRunStore()
    await expect(store.diagnosePort('demo', 8080)).resolves.toBeNull()
  })
})

describe('useRunStore.restart', () => {
  it('保留 stopping 态任务，让重启按钮持续禁用直到 WS 推回 running', async () => {
    restartRun.mockResolvedValue(job({ status: 'stopping' }))
    const store = useRunStore()
    await store.restart('demo', 'run-1')
    // stopping 不属活跃态，但卡片必须留着——否则重启途中卡片会闪掉
    expect(store.jobOf('demo')?.status).toBe('stopping')
  })
})

describe('useRunStore.trackJob', () => {
  it('启动返回后立刻登记，不等 WS', () => {
    const store = useRunStore()
    store.trackJob(job({ status: 'starting' }))
    expect(store.jobOf('demo')?.status).toBe('starting')
  })

  it('已结束的任务不登记', () => {
    const store = useRunStore()
    store.trackJob(job({ status: 'error' }))
    expect(store.jobOf('demo')).toBeNull()
  })
})
