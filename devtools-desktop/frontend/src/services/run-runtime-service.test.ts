import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunJob } from '@/services/modules/run-service'
import { useRunStore } from '@/stores/run'

vi.mock('@/services/modules/run-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/run-service')>(
    '@/services/modules/run-service',
  )
  return { ...actual, getRunStatuses: vi.fn(), getPortOwner: vi.fn() }
})

vi.mock('@/services/tauri-client', () => ({
  tauriClient: { available: true, updateTrayMenu: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/services/desktop-notification', () => ({
  sendDesktopNotification: vi.fn(),
}))

vi.mock('@/services/app-toast', () => ({
  showAppToast: vi.fn(),
}))

const service = await import('@/services/modules/run-service')
const getRunStatuses = vi.mocked(service.getRunStatuses)
const { tauriClient } = await import('@/services/tauri-client')
const updateTrayMenu = vi.mocked(tauriClient.updateTrayMenu)
const { sendDesktopNotification } = await import('@/services/desktop-notification')
const { showAppToast } = await import('@/services/app-toast')
const mockedSendDesktopNotification = vi.mocked(sendDesktopNotification)
const mockedShowAppToast = vi.mocked(showAppToast)
const { createRunRuntimeService } = await import('./run-runtime-service')

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
  delete (window as Window & { __runActiveJob?: unknown }).__runActiveJob
  vi.useRealTimers()
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

  it('running 首次到达时发本地运行成功桌面通知，且同 id 不重复', () => {
    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    const payload = job({
      id: 'run-ok',
      projectName: 'demo',
      status: 'running',
      moduleNames: ['web'],
      url: 'http://127.0.0.1:3000',
    })
    ws.emit('run-status', payload)
    ws.emit('run-status', payload)

    expect(mockedSendDesktopNotification).toHaveBeenCalledOnce()
    expect(mockedSendDesktopNotification).toHaveBeenCalledWith(
      '本地运行成功',
      'demo · web 已启动\nhttp://127.0.0.1:3000',
      true,
      { target: 'log' },
    )
  })

  it('编译报错延时后仍有效才发桌面通知与可点击 toast', () => {
    const deferred: Array<() => void> = []
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') deferred.push(fn as () => void)
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const ws = installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()

    ws.emit('run-status', job({
      id: 'run-err',
      projectName: 'demo',
      status: 'running',
      compileStatus: 'error',
      compileError: 'Module not found',
      compileErrorSeq: 3,
      moduleNames: ['app'],
    }))

    expect(mockedSendDesktopNotification).toHaveBeenCalledOnce()
    mockedSendDesktopNotification.mockClear()
    expect(deferred.length).toBeGreaterThan(0)

    deferred.forEach((fn) => fn())

    expect(mockedSendDesktopNotification).toHaveBeenCalledWith(
      '本地项目编译报错',
      'demo · app\nModule not found',
      false,
      { target: 'log' },
    )
    expect(mockedShowAppToast).toHaveBeenCalledWith('本地项目编译报错', 'demo', { clickable: true })
    expect(useRunStore().jobOf('demo')?.compileStatus).toBe('error')
    setTimeoutSpy.mockRestore()
  })

  it('不再挂载 __runActiveJob 桥', () => {
    installFakeWs()
    const svc = createRunRuntimeService()
    svc.start()
    expect((window as Window & { __runActiveJob?: unknown }).__runActiveJob).toBeUndefined()
    svc.stop()
  })

  it('WS 尚未就绪时 start 不抛错', () => {
    const svc = createRunRuntimeService()
    expect(() => svc.start()).not.toThrow()
    expect(() => svc.stop()).not.toThrow()
  })
})
