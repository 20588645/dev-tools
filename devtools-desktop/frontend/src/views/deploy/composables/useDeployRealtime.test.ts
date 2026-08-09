import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDeployRealtimeService,
  resetDeployFinishedListenersForTest,
  type DeployFinishedDetail,
} from '@/services/deploy-realtime-service'
import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'

import { useDeployRealtime } from './useDeployRealtime'

vi.mock('@/services/modules/deploy-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/deploy-service')>(
    '@/services/modules/deploy-service',
  )
  return { ...actual, getActiveJob: vi.fn().mockResolvedValue(null) }
})

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
    emit(type: string, payload: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(payload)
    },
    count(type: string) {
      return handlers.get(type)?.size ?? 0
    },
  }
  ;(globalThis as { WS?: unknown }).WS = ws
  return ws
}

function mountRealtime(onFinished?: (detail: DeployFinishedDetail) => void) {
  const host = defineComponent({
    setup() {
      useDeployRealtime({ onFinished })
      return () => null
    },
  })
  return mount(host)
}

/** 触发一次成功完成的 done 状态，驱动订阅回调。 */
function emitDone(ws: ReturnType<typeof installFakeWs>, projectName = 'p') {
  const task = useDeployTaskStore()
  const log = useLogTaskStore()
  log.open({ kind: 'deploy', id: 'd1', projectName, title: '部署进度', subtitle: '' }, { steps: ['预检', '完成'] })
  task.begin(projectName)
  task.attachTaskId('d1')
  ws.emit('status', { id: 'd1', phase: 'done', status: 'success', projectName, type: 'deploy', duration: '1s' })
}

describe('useDeployRealtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetDeployFinishedListenersForTest()
    delete (globalThis as { WS?: unknown }).WS
  })

  /*
    WS 处理器已归常驻的 deploy-realtime-service：任务可在任何页面发起并完成，
    刷新恢复更是发生在任何子页挂载之前。composable 挂载多少次都不该新增订阅，
    否则同一条日志会被追加多次。
   */
  it('挂载不注册 WS 处理器，订阅只属于常驻服务', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    mountRealtime()
    mountRealtime()

    expect(ws.count('log')).toBe(1)
    expect(ws.count('progress')).toBe(1)
    expect(ws.count('status')).toBe(1)
  })

  it('完成时把回调转给订阅方', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const calls: string[] = []
    mountRealtime(detail => calls.push(detail.projectName))

    emitDone(ws)

    expect(calls).toEqual(['p'])
  })

  it('卸载后只摘自己的回调，不影响仍挂载的子页', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const goneCalls: string[] = []
    const stayCalls: string[] = []
    const gone = mountRealtime(detail => goneCalls.push(detail.projectName))
    mountRealtime(detail => stayCalls.push(detail.projectName))
    gone.unmount()

    emitDone(ws)

    expect(goneCalls).toEqual([])
    expect(stayCalls).toEqual(['p'])
  })

  it('卸载不影响服务本身的订阅，后台完成仍能收到状态', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const wrapper = mountRealtime()
    wrapper.unmount()

    expect(ws.count('status')).toBe(1)

    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: 'test-1', projectName: 's', title: '连接测试', subtitle: '' }, { steps: ['连接中', 'SFTP', '完成'] })
    task.begin('s')
    task.attachTaskId('test-1')
    ws.emit('status', { id: 'test-1', phase: 'done', status: 'success', duration: 88 })

    expect(log.resultText).toBe('连接测试通过 88ms')
  })
})
