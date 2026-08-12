import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'

import { createDeployRealtimeService, onDeployFinished, resetDeployFinishedListenersForTest } from './deploy-realtime-service'

vi.mock('@/services/modules/deploy-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/deploy-service')>(
    '@/services/modules/deploy-service',
  )
  return { ...actual, getActiveJob: vi.fn() }
})

const deployService = await import('@/services/modules/deploy-service')
const getActiveJob = vi.mocked(deployService.getActiveJob)

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
      for (const handler of handlers.get(type) ?? []) handler(payload)
    },
    count(type: string) {
      return handlers.get(type)?.size ?? 0
    },
  }
  ;(globalThis as { WS?: unknown }).WS = ws
  return ws
}

const BUILD_STEPS = ['拉取代码', '构建中']
const DEPLOY_STEPS = ['预检', '拉取代码', '构建中', '上传中', '完成']

/** 起一个已登记好 id 的部署任务，省去每个用例重复三行。 */
function startTask(id: string, projectName = 'p', steps = DEPLOY_STEPS) {
  const task = useDeployTaskStore()
  const log = useLogTaskStore()
  log.open({ kind: 'deploy', id, projectName, title: '部署进度', subtitle: '' }, { steps })
  task.begin(projectName)
  if (id) task.attachTaskId(id)
  return { task, log }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  resetDeployFinishedListenersForTest()
  getActiveJob.mockResolvedValue(null)
  delete (globalThis as { WS?: unknown }).WS
  delete window.sendDesktopNotification
  delete window.__devtoolsShowToast
  delete window.showToast
})

describe('createDeployRealtimeService', () => {
  it('启动即订阅三条链路与重连事件', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()

    expect(ws.count('log')).toBe(1)
    expect(ws.count('progress')).toBe(1)
    expect(ws.count('status')).toBe(1)
    expect(ws.count('open')).toBe(1)
  })

  it('重复 start 不叠加订阅，stop 后全部摘除', () => {
    const ws = installFakeWs()
    const service = createDeployRealtimeService()
    service.start()
    service.start()
    expect(ws.count('status')).toBe(1)

    service.stop()
    expect(ws.count('log')).toBe(0)
    expect(ws.count('progress')).toBe(0)
    expect(ws.count('status')).toBe(0)
    expect(ws.count('open')).toBe(0)
  })

  it('日志与进度按任务归属追加', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { log } = startTask('d1')

    ws.emit('log', { id: 'd1', text: '开始拉取', type: 'info' })
    ws.emit('progress', { id: 'd1', percent: 42 })

    expect(log.lines.at(-1)?.text).toBe('开始拉取')
    expect(log.percent).toBe(42)
  })

  it('任务 id 未回填时也接受日志，并补写 id', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { task, log } = startTask('', 'p')

    ws.emit('log', { id: 'deploy-1', text: '开始拉取', type: 'info' })

    expect(log.lines.at(-1)?.text).toBe('开始拉取')
    expect(task.taskId).toBe('deploy-1')
  })

  it('忽略不属于当前任务的推送', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { log } = startTask('deploy-1')

    ws.emit('log', { id: 'deploy-2', text: '别的任务', type: 'info' })

    expect(log.lines.some(line => line.text === '别的任务')).toBe(false)
  })

  it('没有活跃任务时全部拒收，不污染上一次的日志', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const log = useLogTaskStore()

    ws.emit('log', { id: 'd9', text: '游离日志', type: 'info' })

    expect(log.lines).toHaveLength(0)
  })

  describe('phase 到步骤的映射', () => {
    const cases: Array<{ steps: string[], phase: string, expected: number }> = [
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
        createDeployRealtimeService().start()
        const { log } = startTask('t-1', 'p', steps)

        ws.emit('status', { id: 't-1', phase, projectName: 'p' })

        expect(log.steps[expected].state).toBe('active')
      })
    }

    it('构建 2 步集收到 uploading 时不越界', () => {
      const ws = installFakeWs()
      createDeployRealtimeService().start()
      const { log } = startTask('t-1', 'p', BUILD_STEPS)

      const before = log.steps.map(step => step.state)
      ws.emit('status', { id: 't-1', phase: 'uploading', projectName: 'p' })

      expect(log.steps.map(step => step.state)).toEqual(before)
    })
  })

  it('done 收尾：标记完成、解锁并回调', () => {
    const ws = installFakeWs()
    const onFinished = vi.fn()
    onDeployFinished(onFinished)
    createDeployRealtimeService().start()
    const { task, log } = startTask('t-1')

    ws.emit('status', { id: 't-1', phase: 'done', status: 'success', projectName: 'p', type: 'deploy', duration: '42s' })

    expect(log.steps.every(step => step.state === 'done')).toBe(true)
    expect(log.percent).toBe(100)
    expect(log.running).toBe(false)
    expect(task.isBusy('p')).toBe(false)
    expect(onFinished).toHaveBeenCalledWith({ projectName: 'p', success: true, type: 'deploy' })
  })

  it('失败 done 给出失败结果且同样解锁', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { task, log } = startTask('t-1', 'p', BUILD_STEPS)

    ws.emit('status', { id: 't-1', phase: 'done', status: 'error', projectName: 'p', type: 'build-only' })

    expect(log.resultText).toBe('构建失败')
    expect(task.isBusy('p')).toBe(false)
  })

  it('连接测试走独立文案，不套用构建/部署结果', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { log } = startTask('test-9', '同仁堂生产', ['连接中', 'SFTP', '完成'])

    ws.emit('status', { id: 'test-9', phase: 'done', status: 'success', duration: 120 })

    expect(log.resultText).toBe('连接测试通过 120ms')
    expect(log.running).toBe(false)
  })

  /*
    退役 legacy WS 处理器后，桌面通知的唯一发出点就是本服务。漏掉它等于用户切到
    别的应用时完全收不到构建结果——这是 legacy 侧原本就有的行为，不能在迁移中丢。
   */
  it('done 时经 legacy 桥发桌面通知', () => {
    const ws = installFakeWs()
    const sendDesktopNotification = vi.fn()
    window.sendDesktopNotification = sendDesktopNotification
    createDeployRealtimeService().start()
    startTask('t-1')

    ws.emit('status', { id: 't-1', phase: 'done', status: 'success', projectName: 'p', type: 'deploy', duration: '42s' })

    expect(sendDesktopNotification).toHaveBeenCalledWith(
      '部署成功',
      'p 部署完成，耗时 42s',
      true,
      { target: 'log' },
    )
  })

  it('弹窗已最小化时后台完成会弹回', () => {
    const ws = installFakeWs()
    createDeployRealtimeService().start()
    const { log } = startTask('t-1')
    log.minimize()

    ws.emit('status', { id: 't-1', phase: 'done', status: 'success', projectName: 'p', type: 'deploy', duration: '1s' })

    expect(log.visible).toBe(true)
  })

  it('取消订阅后不再收到完成回调', () => {
    const ws = installFakeWs()
    const onFinished = vi.fn()
    const stop = onDeployFinished(onFinished)
    createDeployRealtimeService().start()
    startTask('t-1')
    stop()

    ws.emit('status', { id: 't-1', phase: 'done', status: 'success', projectName: 'p', type: 'deploy', duration: '1s' })

    expect(onFinished).not.toHaveBeenCalled()
  })
})

describe('活跃任务恢复', () => {
  const job = (overrides: Partial<Awaited<ReturnType<typeof deployService.getActiveJob>>> = {}) => ({
    id: 'job-1',
    projectName: 'b8seed-portal',
    type: 'deploy' as const,
    phase: 'building',
    startTime: Date.now() - 30_000,
    modules: ['portal', 'admin'],
    serverName: '同仁堂生产',
    logs: [{ text: '已拉取代码', type: 'info' }],
    ...overrides,
  })

  it('启动即恢复：登记任务态、回放日志并推进步骤', async () => {
    installFakeWs()
    getActiveJob.mockResolvedValue(job())
    const service = createDeployRealtimeService()
    await service.resumeActiveJob()

    const task = useDeployTaskStore()
    const log = useLogTaskStore()
    expect(task.taskId).toBe('job-1')
    expect(task.isBusy('b8seed-portal')).toBe(true)
    expect(log.visible).toBe(true)
    expect(log.title).toBe('部署进度')
    expect(log.lines.at(-1)?.text).toBe('已拉取代码')
    // building 在 5 步集里是第 2 步
    expect(log.steps[2].state).toBe('active')
  })

  /*
    这条锁 legacy 的 bug：`checkActiveJob` 里判的是 `type === 'build-only'`，
    而后端 activeJobs 给的是 `'build'`，恒为 false，于是构建任务套上部署的 5 步
    phaseMap——2 步集收到 building 会激活越界的第 2 步。
   */
  it('构建任务用 2 步集，不套用部署的 5 步映射', async () => {
    installFakeWs()
    getActiveJob.mockResolvedValue(job({ type: 'build', phase: 'building' }))
    await createDeployRealtimeService().resumeActiveJob()

    const log = useLogTaskStore()
    expect(log.title).toBe('构建进度')
    expect(log.steps).toHaveLength(2)
    expect(log.steps[1].state).toBe('active')
  })

  it('超过 5 分钟的任务不恢复', async () => {
    installFakeWs()
    getActiveJob.mockResolvedValue(job({ startTime: Date.now() - 6 * 60 * 1000 }))
    await createDeployRealtimeService().resumeActiveJob()

    expect(useDeployTaskStore().hasActiveTask).toBe(false)
    expect(useLogTaskStore().visible).toBe(false)
  })

  it('无活跃任务时什么都不做', async () => {
    installFakeWs()
    getActiveJob.mockResolvedValue(null)
    await createDeployRealtimeService().resumeActiveJob()

    expect(useDeployTaskStore().hasActiveTask).toBe(false)
    expect(useLogTaskStore().visible).toBe(false)
  })

  it('已在跟踪的任务不被恢复流程打断', async () => {
    installFakeWs()
    getActiveJob.mockResolvedValue(job())
    const service = createDeployRealtimeService()
    const { log } = startTask('running-1', 'other')
    log.append('本地已有日志')

    await service.resumeActiveJob()

    expect(getActiveJob).not.toHaveBeenCalled()
    expect(useDeployTaskStore().taskId).toBe('running-1')
    expect(log.lines.at(-1)?.text).toBe('本地已有日志')
  })

  it('取数失败时不抛出，保持现状', async () => {
    installFakeWs()
    getActiveJob.mockRejectedValue(new Error('sidecar 未就绪'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(createDeployRealtimeService().resumeActiveJob()).resolves.toBeUndefined()
    expect(useLogTaskStore().visible).toBe(false)
    warn.mockRestore()
  })

  /* WS 重连后断线期间的推送已丢失，必须重新对账，否则卡片忙态与日志都停在断线那一刻。 */
  it('WS 重连触发重新对账', async () => {
    const ws = installFakeWs()
    getActiveJob.mockResolvedValue(job())
    createDeployRealtimeService().start()
    getActiveJob.mockClear()

    ws.emit('open')
    await vi.waitFor(() => expect(getActiveJob).toHaveBeenCalled())
  })
})
