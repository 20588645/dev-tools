import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunJob } from '@/services/modules/run-service'

import { createRunRuntimeService } from './run-runtime-service'

vi.mock('@/services/modules/run-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/run-service')>(
    '@/services/modules/run-service',
  )
  return { ...actual, getRunStatuses: vi.fn(), getPortOwner: vi.fn() }
})

vi.mock('@/services/tauri-client', () => ({
  tauriClient: { available: true, updateTrayMenu: vi.fn().mockResolvedValue(undefined) },
}))

const service = await import('@/services/modules/run-service')
const getRunStatuses = vi.mocked(service.getRunStatuses)
const { tauriClient } = await import('@/services/tauri-client')
const updateTrayMenu = vi.mocked(tauriClient.updateTrayMenu)

const job = (overrides: Partial<RunJob> = {}): RunJob =>
  service.normalizeRunJob({ id: 'run-1', projectName: 'demo', status: 'running', ...overrides })

/** 假的旧全局 WS，避免测试依赖真实连接。 */
function installFakeWs() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>()
  const ws = {
    on(type: string, handler: (payload: unknown) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    off(type: string, handler: (payload: unknown) => void) {
      handlers.get(type)?.delete(handler)
    },
    emit(type: string, payload?: unknown) {
      for (const h of handlers.get(type) ?? []) h(payload)
    },
    count(type: string) {
      return handlers.get(type)?.size ?? 0
    },
  }
  ;(globalThis as { WS?: unknown }).WS = ws
  return ws
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getRunStatuses.mockResolvedValue([])
  delete (globalThis as { WS?: unknown }).WS
  delete window.__runActiveJob
})

describe('createRunRuntimeService', () => {
  /*
    这条是本次跨页耦合收口的核心：托盘在启动即可见，而 run store 的 reconcile
    原先只由 RunView 触发。服务必须在不挂载任何页面的情况下完成首次对账，
    否则用户不进本地运行页时托盘就是空的。
  */
  it('启动即对账一次，不依赖任何页面挂载', async () => {
    getRunStatuses.mockResolvedValue([job({ projectName: 'p-run', status: 'running' })])
    installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    await vi.waitFor(() => expect(getRunStatuses).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => {
      expect(updateTrayMenu.mock.calls.at(-1)?.[0]).toEqual([{ name: 'p-run', status: 'running' }])
    })
  })

  it('注册 open 与 run-status 两个处理器，stop 后摘净', () => {
    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    expect(ws.count('open')).toBe(1)
    expect(ws.count('run-status')).toBe(1)
    svc.stop()
    expect(ws.count('open')).toBe(0)
    expect(ws.count('run-status')).toBe(0)
  })

  it('重复 start 不叠加处理器', () => {
    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    svc.start()
    expect(ws.count('open')).toBe(1)
  })

  it('WS 重连后重新对账，纠正断线期间丢失的推送', async () => {
    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    await vi.waitFor(() => expect(getRunStatuses).toHaveBeenCalledTimes(1))

    getRunStatuses.mockResolvedValue([job({ projectName: 'p-late', status: 'running' })])
    ws.emit('open')
    await vi.waitFor(() => expect(getRunStatuses).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => {
      expect(updateTrayMenu.mock.calls.at(-1)?.[0]).toEqual([{ name: 'p-late', status: 'running' }])
    })
  })

  it('未打开本地运行页时，run-status 推送也能让托盘跟上', async () => {
    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    ws.emit('run-status', job({ projectName: 'p-ws', status: 'starting' }))
    expect(updateTrayMenu.mock.calls.at(-1)?.[0]).toEqual([{ name: 'p-ws', status: 'starting' }])
  })

  it('装卸只读桥供 legacy 校验编译报错的新鲜度', () => {
    installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    expect(typeof window.__runActiveJob).toBe('function')

    // 桥回答「该项目当前活跃任务」，legacy 用它判断报错是否已过期
    expect(window.__runActiveJob?.('p')).toBeNull()

    svc.stop()
    expect(window.__runActiveJob).toBeUndefined()
  })

  it('WS 尚未就绪时 start 不抛错', () => {
    const svc = createRunRuntimeService()
    expect(() => svc.start()).not.toThrow()
    expect(() => svc.stop()).not.toThrow()
  })
})
