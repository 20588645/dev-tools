import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeServer, type DeployServer } from '@/services/modules/deploy-service'
import { normalizeProject, type Project } from '@/services/modules/project-service'

import { useBuildDeploy } from './useBuildDeploy'

vi.mock('@/services/modules/deploy-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/deploy-service')>(
    '@/services/modules/deploy-service',
  )
  return {
    ...actual,
    getGitLog: vi.fn(),
    quickTestServer: vi.fn(),
    startBuild: vi.fn(),
    startDeploy: vi.fn(),
  }
})

vi.mock('@/services/modules/project-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/project-service')>(
    '@/services/modules/project-service',
  )
  return { ...actual, updateProject: vi.fn() }
})

const taskStoreApi = vi.hoisted(() => ({
  begin: vi.fn(),
  attachTaskId: vi.fn(),
  abandon: vi.fn(),
}))

const logStoreApi = vi.hoisted(() => ({
  open: vi.fn(),
  setProgress: vi.fn(),
  attachTaskId: vi.fn(),
  append: vi.fn(),
  setRunning: vi.fn(),
}))

vi.mock('@/stores/deploy-task', () => ({
  useDeployTaskStore: vi.fn(() => taskStoreApi),
}))

vi.mock('@/stores/log-task', () => ({
  useLogTaskStore: vi.fn(() => logStoreApi),
}))

const deployService = await import('@/services/modules/deploy-service')
const projectService = await import('@/services/modules/project-service')
const getGitLog = vi.mocked(deployService.getGitLog)
const quickTestServer = vi.mocked(deployService.quickTestServer)
const startBuild = vi.mocked(deployService.startBuild)
const startDeploy = vi.mocked(deployService.startDeploy)
const updateProject = vi.mocked(projectService.updateProject)

/** Vitest 默认环境不带 localStorage，这里用内存表顶上偏好读写。 */
function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() { return store.size },
    clear: () => { store.clear() },
    getItem: (key) => store.has(key) ? store.get(key)! : null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => { store.delete(key) },
    setItem: (key, value) => { store.set(key, String(value)) },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  })
}

installMemoryLocalStorage()

const multi = (overrides: Record<string, unknown> = {}): Project => normalizeProject({
  name: 'portal',
  displayName: '门户',
  type: 'multi-module',
  tool: 'pnpm',
  nodeVersion: '18.19.1',
  modules: [{ name: 'home', uploadStrategy: '' }, { name: 'admin', uploadStrategy: '' }, { name: 'shop', uploadStrategy: '' }],
  defaultServerIds: ['srv-1'],
  defaultServerId: 'srv-1',
  ...overrides,
})

const single = (): Project => normalizeProject({
  name: 'blog',
  displayName: 'blog',
  type: 'single',
  tool: 'Vite',
  nodeVersion: '',
  modules: [],
  defaultServerIds: [],
  defaultServerId: '',
})

const server = (overrides: Record<string, unknown> = {}): DeployServer => normalizeServer({
  id: 'srv-1',
  name: 'prod',
  host: '10.0.0.1',
  defaultRemotePath: '/www/',
  deployPaths: ['/www/', '/backup/'],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  getGitLog.mockResolvedValue({ branch: 'main', commits: [] })
  startBuild.mockResolvedValue({ id: 'task-b' })
  startDeploy.mockResolvedValue({ id: 'task-d' })
  updateProject.mockResolvedValue(undefined)
  quickTestServer.mockResolvedValue({ id: 'srv-1', ok: true, duration: 42, error: '' })
})

describe('useBuildDeploy 打开与模块偏好', () => {
  it('构建弹窗回填上次勾选与收藏，单体不预选模块', async () => {
    localStorage.setItem('last_portal', JSON.stringify(['admin']))
    localStorage.setItem('fav_portal', JSON.stringify(['shop']))

    const bd = useBuildDeploy()
    bd.openBuild(multi())
    await Promise.resolve()

    expect(bd.mode.value).toBe('build')
    expect(bd.selectedModules.value).toEqual(['admin'])
    expect(bd.favorites.value).toEqual(['shop'])
    expect(bd.nodeVersion.value).toBe('18.19.1')

    bd.openBuild(single())
    expect(bd.selectedModules.value).toEqual([])
    expect(bd.isMulti.value).toBe(false)
  })

  it('部署弹窗勾上项目默认服务器，并据此填充发布目录', () => {
    const bd = useBuildDeploy()
    bd.openDeploy(multi(), [
      server({ id: 'srv-1' }),
      server({ id: 'srv-2', name: 'stage', deployPaths: ['/stage/'] }),
    ])

    expect(bd.serverIds.value).toEqual(['srv-1'])
    expect(bd.pathOptions.value).toEqual(['/www/', '/backup/'])
    expect(bd.remotePath.value).toBe('/www/')
  })

  it('收藏写入 localStorage，筛选「常用」只看收藏', () => {
    const bd = useBuildDeploy()
    bd.openBuild(multi())
    bd.toggleFavorite('home')
    expect(JSON.parse(localStorage.getItem('fav_portal') || '[]')).toEqual(['home'])

    bd.moduleFilter.value = 'fav'
    expect(bd.visibleModules.value).toEqual(['home'])
    bd.moduleFilter.value = 'all'
    bd.moduleQuery.value = 'AD'
    expect(bd.visibleModules.value).toEqual(['admin'])
  })

  it('全选在「常用」筛选下只动收藏模块', () => {
    localStorage.setItem('fav_portal', JSON.stringify(['home', 'shop']))
    const bd = useBuildDeploy()
    bd.openBuild(multi())
    bd.moduleFilter.value = 'fav'
    bd.toggleAll(true)
    expect(bd.selectedModules.value.sort()).toEqual(['home', 'shop'])
    bd.toggleAll(false)
    expect(bd.selectedModules.value).toEqual([])
  })
})

describe('useBuildDeploy 服务器与路径', () => {
  it('切换首台服务器时刷新路径下拉', () => {
    const bd = useBuildDeploy()
    bd.openDeploy(multi({ defaultServerIds: [], defaultServerId: '' }), [
      server({ id: 'srv-1' }),
      server({ id: 'srv-2', name: 'stage', deployPaths: ['/stage/'], defaultRemotePath: '/stage/' }),
    ])
    bd.setServerChecked('srv-2', true)
    expect(bd.serverIds.value).toEqual(['srv-2'])
    expect(bd.pathOptions.value).toEqual(['/stage/'])
  })

  it('浏览确认的新路径追加到选项并选中', () => {
    const bd = useBuildDeploy()
    bd.openDeploy(multi(), [server()])
    bd.applyRemotePath('/docker/nginx/www')
    expect(bd.remotePath.value).toBe('/docker/nginx/www/')
    expect(bd.pathOptions.value).toContain('/docker/nginx/www/')
  })

  it('未勾选服务器时 remoteBrowserTarget 返回 null', () => {
    const bd = useBuildDeploy()
    bd.openDeploy(multi({ defaultServerIds: [], defaultServerId: '' }), [server()])
    expect(bd.remoteBrowserTarget()).toBeNull()
    bd.setServerChecked('srv-1', true)
    expect(bd.remoteBrowserTarget()?.serverId).toBe('srv-1')
  })
})

describe('useBuildDeploy 发起', () => {
  it('多模块未勾选时拦住提交', async () => {
    const bd = useBuildDeploy()
    bd.openBuild(multi())
    bd.selectedModules.value = []
    expect(await bd.submit()).toBe('blocked')
    expect(bd.error.value).toBe('请至少选择一个模块')
    expect(startBuild).not.toHaveBeenCalled()
  })

  it('构建成功：先 begin，再请求，再 attachTaskId，并记住勾选', async () => {
    const bd = useBuildDeploy()
    bd.openBuild(multi())
    bd.selectedModules.value = ['admin']

    expect(await bd.submit()).toBe('ok')
    expect(taskStoreApi.begin).toHaveBeenCalledWith('portal')
    expect(logStoreApi.open).toHaveBeenCalled()
    expect(startBuild).toHaveBeenCalledWith({
      projectName: 'portal',
      modules: ['admin'],
      nodeVersion: '18.19.1',
    })
    expect(taskStoreApi.attachTaskId).toHaveBeenCalledWith('task-b')
    expect(logStoreApi.attachTaskId).toHaveBeenCalledWith('task-b')
    expect(JSON.parse(localStorage.getItem('last_portal') || '[]')).toEqual(['admin'])
    expect(bd.open.value).toBe(false)
  })

  it('构建失败时 abandon 并停掉日志 running', async () => {
    startBuild.mockRejectedValueOnce(new Error('网络中断'))
    const bd = useBuildDeploy()
    bd.openBuild(single())

    await bd.submit()
    expect(taskStoreApi.abandon).toHaveBeenCalledWith('blog')
    expect(logStoreApi.append).toHaveBeenCalled()
    expect(logStoreApi.setRunning).toHaveBeenCalledWith(false)
  })

  it('多服务器部署先挂确认，确认后才发请求', async () => {
    const bd = useBuildDeploy()
    bd.openDeploy(multi(), [
      server({ id: 'srv-1' }),
      server({ id: 'srv-2', name: 'stage' }),
    ])
    bd.selectedModules.value = ['home']
    bd.setServerChecked('srv-2', true)

    expect(await bd.submit()).toBe('confirm')
    expect(bd.pendingMultiConfirm.value?.serverIds).toEqual(['srv-1', 'srv-2'])
    expect(startDeploy).not.toHaveBeenCalled()

    await bd.confirmMultiDeploy()
    expect(startDeploy).toHaveBeenCalledWith(expect.objectContaining({
      projectName: 'portal',
      serverIds: ['srv-1', 'srv-2'],
      serverId: 'srv-1',
      remotePath: '/www/',
    }))
  })

  it('Node 版本变更时静默写回项目', async () => {
    const bd = useBuildDeploy()
    bd.openBuild(multi())
    bd.selectedModules.value = ['home']
    bd.nodeVersion.value = '20.0.0'
    await bd.submit()
    expect(updateProject).toHaveBeenCalledWith('portal', { nodeVersion: '20.0.0' })
  })
})

describe('useBuildDeploy 快速测连', () => {
  it('未选服务器时报错；成功后汇总 all-ok', async () => {
    vi.useFakeTimers()
    const bd = useBuildDeploy()
    bd.openDeploy(multi({ defaultServerIds: [], defaultServerId: '' }), [server()])
    await bd.quickTest()
    expect(bd.error.value).toBe('请先选择至少一个服务器')

    bd.setServerChecked('srv-1', true)
    await bd.quickTest()
    expect(bd.connBadges.value['srv-1']?.status).toBe('ok')
    expect(bd.testSummary.value).toBe('all-ok')
    vi.advanceTimersByTime(3000)
    expect(bd.testSummary.value).toBe('idle')
    vi.useRealTimers()
  })
})
