import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRunRealtime } from './useRunRealtime'

vi.mock('@/services/modules/run-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/run-service')>(
    '@/services/modules/run-service',
  )
  return { ...actual, getRunStatuses: vi.fn() }
})

const service = await import('@/services/modules/run-service')
const getRunStatuses = vi.mocked(service.getRunStatuses)

/** 模拟旧全局 WS，只实现 on/off/emit。 */
function installFakeWs() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>()
  const ws = {
    on(type: string, handler: (payload: unknown) => void) {
      const set = handlers.get(type) ?? new Set()
      set.add(handler)
      handlers.set(type, set)
    },
    off(type: string, handler: (payload: unknown) => void) {
      handlers.get(type)?.delete(handler)
    },
    emit(type: string, payload?: unknown) {
      handlers.get(type)?.forEach(fn => fn(payload))
    },
    count(type: string) {
      return handlers.get(type)?.size ?? 0
    },
  }
  ;(globalThis as { WS?: unknown }).WS = ws
  return ws
}

function mountWith(options: Parameters<typeof useRunRealtime>[0] = {}) {
  const captured: { api: ReturnType<typeof useRunRealtime> | null } = { api: null }
  const wrapper = mount(defineComponent({
    setup() {
      captured.api = useRunRealtime(options)
      return () => h('div')
    },
  }))
  return { wrapper, api: captured.api! }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.useFakeTimers()
  getRunStatuses.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as { WS?: unknown }).WS
})

describe('useRunRealtime WS 订阅', () => {
  it('挂载时订阅 run-status / run-log / open，卸载时全部退订', () => {
    const ws = installFakeWs()
    const { wrapper } = mountWith()
    expect(ws.count('run-status')).toBe(1)
    expect(ws.count('run-log')).toBe(1)
    expect(ws.count('open')).toBe(1)

    wrapper.unmount()
    expect(ws.count('run-status')).toBe(0)
    expect(ws.count('run-log')).toBe(0)
    expect(ws.count('open')).toBe(0)
  })

  it('run-status 推送写入 store 并回调', () => {
    const ws = installFakeWs()
    const onStatus = vi.fn()
    mountWith({ onStatus })
    ws.emit('run-status', { id: 'r1', projectName: 'demo', status: 'running' })
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ active: true }))
  })

  it('WS open 触发全量对账（第二道兜底）', () => {
    const ws = installFakeWs()
    mountWith()
    getRunStatuses.mockClear()
    ws.emit('open')
    expect(getRunStatuses).toHaveBeenCalledTimes(1)
  })

  it('run-log 推送归一化后回调', () => {
    const ws = installFakeWs()
    const onLog = vi.fn()
    mountWith({ onLog })
    ws.emit('run-log', { id: 'r1', projectName: 'demo', text: 'hello', type: 'info' })
    expect(onLog).toHaveBeenCalledWith({ id: 'r1', projectName: 'demo', text: 'hello', type: 'info' })
  })

  it('缺少全局 WS 时不抛错', () => {
    delete (globalThis as { WS?: unknown }).WS
    expect(() => mountWith()).not.toThrow()
  })
})

describe('useRunRealtime 轮询（第三道兜底）', () => {
  it('无运行中项目时只滴答、不请求后端', async () => {
    installFakeWs()
    const onTick = vi.fn()
    mountWith({ onTick })
    getRunStatuses.mockClear()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(onTick).toHaveBeenCalledTimes(1)
    // 空闲不打扰后端
    expect(getRunStatuses).not.toHaveBeenCalled()
  })

  it('有运行中项目时轮询会对账', async () => {
    const ws = installFakeWs()
    mountWith()
    ws.emit('run-status', { id: 'r1', projectName: 'demo', status: 'running' })
    getRunStatuses.mockClear()
    getRunStatuses.mockResolvedValue([
      service.normalizeRunJob({ id: 'r1', projectName: 'demo', status: 'running' }),
    ])

    await vi.advanceTimersByTimeAsync(15_000)
    expect(getRunStatuses).toHaveBeenCalledTimes(1)
  })

  it('tick 每个周期自增，供运行时长重算', async () => {
    installFakeWs()
    const { api } = mountWith()
    expect(api.tick.value).toBe(0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(api.tick.value).toBe(2)
  })

  it('页面不可见时不请求后端', async () => {
    const ws = installFakeWs()
    mountWith()
    ws.emit('run-status', { id: 'r1', projectName: 'demo', status: 'running' })
    getRunStatuses.mockClear()

    // usePageVisibility 靠 visibilitychange 事件更新，只改 getter 不会让它感知
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(getRunStatuses).not.toHaveBeenCalled()

    // 回到前台后恢复对账
    spy.mockRestore()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(getRunStatuses).toHaveBeenCalledTimes(1)
  })

  it('卸载后停表，不再滴答', async () => {
    installFakeWs()
    const { wrapper, api } = mountWith()
    wrapper.unmount()
    const before = api.tick.value
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.tick.value).toBe(before)
  })

  it('轮询间隔为 15 秒', () => {
    installFakeWs()
    const { api } = mountWith()
    expect(api.pollInterval).toBe(15_000)
  })
})
