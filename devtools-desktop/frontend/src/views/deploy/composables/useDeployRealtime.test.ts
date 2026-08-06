import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'

import { useDeployRealtime } from './useDeployRealtime'

/** 用假的旧全局 WS 驱动，避免测试依赖真实连接。 */
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

function mountRealtime(onFinished?: (detail: { projectName: string, success: boolean, type: string }) => void) {
  const host = defineComponent({
    setup() {
      useDeployRealtime({ onFinished })
      return () => null
    },
  })
  return mount(host)
}

const BUILD_STEPS = ['拉取代码', '构建中']
const DEPLOY_STEPS = ['预检', '拉取代码', '构建中', '上传中', '完成']

describe('useDeployRealtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('卸载时摘掉全部监听，避免多次进入页面后重复处理', () => {
    const ws = installFakeWs()
    const wrapper = mountRealtime()

    expect(ws.count('log')).toBe(1)
    expect(ws.count('progress')).toBe(1)
    expect(ws.count('status')).toBe(1)

    wrapper.unmount()
    expect(ws.count('log')).toBe(0)
    expect(ws.count('progress')).toBe(0)
    expect(ws.count('status')).toBe(0)
  })

  it('任务 id 未回填时也接受日志，并补写 id', () => {
    const ws = installFakeWs()
    mountRealtime()
    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: null, projectName: 'p', title: '部署进度', subtitle: '' }, { steps: DEPLOY_STEPS })
    task.begin('p')

    ws.emit('log', { id: 'deploy-1', text: '开始拉取', type: 'info' })

    expect(log.lines.at(-1)?.text).toBe('开始拉取')
    expect(task.taskId).toBe('deploy-1')
  })

  it('忽略不属于当前任务的推送', () => {
    const ws = installFakeWs()
    mountRealtime()
    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: null, projectName: 'p', title: '部署进度', subtitle: '' }, { steps: DEPLOY_STEPS })
    task.begin('p')
    task.attachTaskId('deploy-1')

    ws.emit('log', { id: 'deploy-2', text: '别的任务', type: 'info' })

    expect(log.lines.some(line => line.text === '别的任务')).toBe(false)
  })

  describe('phase 到步骤的映射', () => {
    const cases: Array<{ steps: string[], phase: string, expected: number }> = [
      // 部署 5 步
      { steps: DEPLOY_STEPS, phase: 'preflight', expected: 0 },
      { steps: DEPLOY_STEPS, phase: 'pulling', expected: 1 },
      { steps: DEPLOY_STEPS, phase: 'building', expected: 2 },
      { steps: DEPLOY_STEPS, phase: 'uploading', expected: 3 },
      // 构建 2 步：没有预检与上传，pulling/building 各前移一位
      { steps: BUILD_STEPS, phase: 'pulling', expected: 0 },
      { steps: BUILD_STEPS, phase: 'building', expected: 1 },
    ]

    for (const { steps, phase, expected } of cases) {
      it(`${steps.length} 步集的 ${phase} 激活第 ${expected} 步`, () => {
        const ws = installFakeWs()
        mountRealtime()
        const task = useDeployTaskStore()
        const log = useLogTaskStore()
        log.open({ kind: 'deploy', id: null, projectName: 'p', title: '进度', subtitle: '' }, { steps })
        task.begin('p')
        task.attachTaskId('t-1')

        ws.emit('status', { id: 't-1', phase, projectName: 'p' })

        expect(log.steps[expected].state).toBe('active')
      })
    }

    it('构建 2 步集收到 uploading 时不越界', () => {
      const ws = installFakeWs()
      mountRealtime()
      const task = useDeployTaskStore()
      const log = useLogTaskStore()
      log.open({ kind: 'deploy', id: null, projectName: 'p', title: '进度', subtitle: '' }, { steps: BUILD_STEPS })
      task.begin('p')
      task.attachTaskId('t-1')

      const before = log.steps.map(step => step.state)
      ws.emit('status', { id: 't-1', phase: 'uploading', projectName: 'p' })

      // 该 phase 在 2 步集里没有对应步骤，应原样忽略而不是越界或误推进
      expect(log.steps.map(step => step.state)).toEqual(before)
    })
  })

  it('done 收尾：标记完成、解锁并回调', () => {
    const ws = installFakeWs()
    const onFinished = vi.fn()
    mountRealtime(onFinished)
    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: null, projectName: 'p', title: '进度', subtitle: '' }, { steps: DEPLOY_STEPS })
    task.begin('p')
    task.attachTaskId('t-1')

    ws.emit('status', { id: 't-1', phase: 'done', status: 'success', projectName: 'p', type: 'deploy', duration: '42s' })

    expect(log.steps.every(step => step.state === 'done')).toBe(true)
    expect(log.percent).toBe(100)
    expect(log.running).toBe(false)
    expect(task.isBusy('p')).toBe(false)
    expect(onFinished).toHaveBeenCalledWith({ projectName: 'p', success: true, type: 'deploy' })
  })

  it('失败 done 给出失败结果且同样解锁', () => {
    const ws = installFakeWs()
    mountRealtime()
    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: null, projectName: 'p', title: '进度', subtitle: '' }, { steps: BUILD_STEPS })
    task.begin('p')
    task.attachTaskId('t-1')

    ws.emit('status', { id: 't-1', phase: 'done', status: 'error', projectName: 'p', type: 'build-only' })

    expect(log.resultText).toBe('构建失败')
    expect(task.isBusy('p')).toBe(false)
  })

  it('连接测试走独立文案，不套用构建/部署结果', () => {
    const ws = installFakeWs()
    mountRealtime()
    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    log.open({ kind: 'deploy', id: null, projectName: '同仁堂生产', title: '连接测试', subtitle: '' }, { steps: ['连接中', 'SFTP', '完成'] })
    task.begin('同仁堂生产')
    task.attachTaskId('test-9')

    ws.emit('status', { id: 'test-9', phase: 'done', status: 'success', duration: 120 })

    expect(log.resultText).toBe('连接测试通过 120ms')
    expect(log.running).toBe(false)
  })
})
