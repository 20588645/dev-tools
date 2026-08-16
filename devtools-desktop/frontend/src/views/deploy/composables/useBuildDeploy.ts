import { computed, ref, shallowRef } from 'vue'

import {
  getGitLog,
  quickTestServer,
  startBuild,
  startDeploy,
  type DeployServer,
  type GitLogEntry,
} from '@/services/modules/deploy-service'
import {
  projectDefaultServerIds,
  updateProject,
  type Project,
} from '@/services/modules/project-service'
import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'

/**
 * 构建 / 部署弹窗的状态与发起。
 *
 * 取代 legacy `deploy.js` 的模块多选、服务器勾选、发布目录、快速测连、
 * git log 预览与 `startBuildOnly` / `startDeploy`。远程浏览本身由
 * `useRemoteBrowser` 承担，本 composable 只负责「打开浏览」所需的目标服务器
 * 与「确认路径」回写。
 *
 * localStorage 键名保持 `fav_${name}` / `last_${name}`，用户已有偏好沿用。
 */

export type BuildDeployMode = 'build' | 'deploy'
export type ModuleFilter = 'all' | 'fav'
export type ConnBadgeStatus = 'idle' | 'testing' | 'ok' | 'fail'
export type QuickTestSummary = 'idle' | 'testing' | 'all-ok' | 'partial-fail'

/** 与 `deploy-realtime-service` 内同名常量保持一致——步骤文案是进度条契约。 */
const BUILD_STEPS = ['拉取代码', '构建中']
const DEPLOY_STEPS = ['预检', '拉取代码', '构建中', '上传中', '完成']

export interface ConnBadge {
  status: ConnBadgeStatus
  duration: number
  error: string
}

export interface MultiDeployConfirm {
  serverIds: string[]
  names: string
}

function readJsonList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeJsonList(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values))
}

function pathsOf(server: DeployServer | undefined): string[] {
  if (!server) return ['/']
  if (server.deployPaths.length > 0) return [...server.deployPaths]
  return [server.defaultRemotePath || '/']
}

export function useBuildDeploy() {
  const task = useDeployTaskStore()
  const log = useLogTaskStore()

  const mode = ref<BuildDeployMode>('build')
  const project = ref<Project | null>(null)
  /** 部署模式才有意义；构建模式忽略。 */
  const servers = shallowRef<DeployServer[]>([])
  /** 构建成功后走网关 FileZilla 交接，而不是直连上传。 */
  const handoff = ref(false)

  const selectedModules = ref<string[]>([])
  const favorites = ref<string[]>([])
  const moduleFilter = ref<ModuleFilter>('all')
  const moduleQuery = ref('')
  const nodeVersion = ref('')

  const serverIds = ref<string[]>([])
  const remotePath = ref('/')
  /** 下拉选项；浏览确认的新路径若不在列表里会追加。 */
  const pathOptions = ref<string[]>([])

  const gitBranch = ref('')
  const gitCommits = shallowRef<GitLogEntry[]>([])

  const submitting = ref(false)
  const testing = ref(false)
  const testSummary = ref<QuickTestSummary>('idle')
  const connBadges = ref<Record<string, ConnBadge>>({})
  /** 校验失败的即时提示（未选模块/服务器等），由对话框展示。 */
  const error = ref('')
  /** 多服务器确认：非 null 时外层挂 ConfirmDialog。 */
  const pendingMultiConfirm = ref<MultiDeployConfirm | null>(null)

  let testSummaryTimer: ReturnType<typeof setTimeout> | null = null

  const open = computed(() => project.value !== null)
  const isMulti = computed(() => project.value?.type === 'multi-module')
  const isDeploy = computed(() => mode.value === 'deploy')

  const title = computed(() => {
    if (!project.value) return ''
    if (handoff.value) return '构建并交接到 FileZilla'
    return mode.value === 'build' ? '构建项目' : '部署项目'
  })

  const subtitle = computed(() => {
    const target = project.value
    if (!target) return ''
    if (target.type === 'multi-module') {
      return `多模块项目 · ${target.modules.length} 个可部署模块`
    }
    return `单体项目 · ${target.tool || '整体构建'}`
  })

  const visibleModules = computed(() => {
    const target = project.value
    if (!target) return [] as string[]
    const keyword = moduleQuery.value.trim().toLowerCase()
    let names = target.modules.map(item => item.name)
    if (keyword) names = names.filter(name => name.toLowerCase().includes(keyword))
    if (moduleFilter.value === 'fav') {
      const favSet = new Set(favorites.value)
      names = names.filter(name => favSet.has(name))
    }
    return names
  })

  /**
   * 「全部」筛选下：常用模块置顶，其后跟「其他模块」分隔。
   * 「常用」筛选下：只返回常用列表，空态由对话框处理。
   */
  const moduleSections = computed(() => {
    const favSet = new Set(favorites.value)
    const names = visibleModules.value
    if (moduleFilter.value === 'fav') {
      return { favorites: names, others: [] as string[] }
    }
    return {
      favorites: names.filter(name => favSet.has(name)),
      others: names.filter(name => !favSet.has(name)),
    }
  })

  const firstServer = computed(() => {
    const id = serverIds.value[0]
    return id ? servers.value.find(item => item.id === id) : undefined
  })

  function clearTestSummaryTimer() {
    if (testSummaryTimer) {
      clearTimeout(testSummaryTimer)
      testSummaryTimer = null
    }
  }

  function resetTransient() {
    moduleFilter.value = 'all'
    moduleQuery.value = ''
    error.value = ''
    gitBranch.value = ''
    gitCommits.value = []
    submitting.value = false
    testing.value = false
    testSummary.value = 'idle'
    connBadges.value = {}
    pendingMultiConfirm.value = null
    clearTestSummaryTimer()
  }

  function syncPathOptions() {
    const next = pathsOf(firstServer.value)
    pathOptions.value = next
    // 切换服务器时落到其默认路径；若当前路径仍在新列表里则保留（浏览选过的也算）
    if (!pathOptions.value.includes(remotePath.value)) {
      remotePath.value = next[0] ?? '/'
    }
  }

  async function loadGit(projectName: string) {
    try {
      const result = await getGitLog(projectName)
      // 打开期间若用户已关掉或换了项目，丢弃过期结果
      if (project.value?.name !== projectName) return
      gitBranch.value = result.branch
      gitCommits.value = result.commits
    } catch {
      if (project.value?.name !== projectName) return
      gitBranch.value = ''
      gitCommits.value = []
    }
  }

  function openBuild(target: Project) {
    mode.value = 'build'
    handoff.value = false
    project.value = target
    servers.value = []
    serverIds.value = []
    resetTransient()
    favorites.value = readJsonList(`fav_${target.name}`)
    selectedModules.value = target.type === 'multi-module'
      ? readJsonList(`last_${target.name}`)
      : []
    nodeVersion.value = target.nodeVersion || ''
    void loadGit(target.name)
  }

  function openHandoff(target: Project) {
    openBuild(target)
    handoff.value = true
  }

  function openDeploy(target: Project, serverList: DeployServer[]) {
    mode.value = 'deploy'
    handoff.value = false
    project.value = target
    servers.value = serverList
    resetTransient()
    favorites.value = readJsonList(`fav_${target.name}`)
    selectedModules.value = target.type === 'multi-module'
      ? readJsonList(`last_${target.name}`)
      : []
    nodeVersion.value = target.nodeVersion || ''
    const defaults = new Set(projectDefaultServerIds(target))
    serverIds.value = serverList.filter(item => defaults.has(item.id)).map(item => item.id)
    remotePath.value = '/'
    syncPathOptions()
    void loadGit(target.name)
  }

  function close() {
    project.value = null
    pendingMultiConfirm.value = null
    error.value = ''
    clearTestSummaryTimer()
  }

  function toggleModule(name: string) {
    const set = new Set(selectedModules.value)
    if (set.has(name)) set.delete(name)
    else set.add(name)
    selectedModules.value = [...set]
  }

  function toggleAll(check: boolean) {
    const target = project.value
    if (!target) return
    if (moduleFilter.value === 'fav') {
      const favSet = new Set(favorites.value)
      if (check) {
        const merged = new Set(selectedModules.value)
        favSet.forEach(name => merged.add(name))
        selectedModules.value = [...merged]
      } else {
        selectedModules.value = selectedModules.value.filter(name => !favSet.has(name))
      }
      return
    }
    selectedModules.value = check ? target.modules.map(item => item.name) : []
  }

  function toggleFavorite(name: string) {
    const target = project.value
    if (!target) return
    const next = favorites.value.includes(name)
      ? favorites.value.filter(item => item !== name)
      : [...favorites.value, name]
    favorites.value = next
    writeJsonList(`fav_${target.name}`, next)
  }

  /** 服务器勾选。首台（数组第 0 项）决定发布目录下拉的选项源。 */
  function setServerChecked(id: string, checked: boolean) {
    if (checked) {
      if (!serverIds.value.includes(id)) serverIds.value = [...serverIds.value, id]
    } else {
      serverIds.value = serverIds.value.filter(item => item !== id)
    }
    syncPathOptions()
  }

  function applyRemotePath(path: string) {
    const finalPath = path.endsWith('/') ? path : `${path}/`
    if (!pathOptions.value.includes(finalPath)) {
      pathOptions.value = [...pathOptions.value, finalPath]
    }
    remotePath.value = finalPath
  }

  /**
   * 打开远程浏览所需的目标。未勾选服务器时返回 null，由调用方 toast。
   */
  function remoteBrowserTarget(): {
    serverId: string
    serverName: string
    host: string
    startPath: string
  } | null {
    const server = firstServer.value
    if (!server) return null
    return {
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      startPath: server.defaultRemotePath || '/',
    }
  }

  async function quickTest() {
    if (serverIds.value.length === 0) {
      error.value = '请先选择至少一个服务器'
      return
    }
    if (testing.value) return
    testing.value = true
    testSummary.value = 'testing'
    error.value = ''
    clearTestSummaryTimer()

    const ids = [...serverIds.value]
    const nextBadges: Record<string, ConnBadge> = { ...connBadges.value }
    for (const id of ids) {
      nextBadges[id] = { status: 'testing', duration: 0, error: '' }
    }
    connBadges.value = nextBadges

    const results = await Promise.allSettled(ids.map(async (id) => {
      try {
        return await quickTestServer(id)
      } catch (cause) {
        return {
          id,
          ok: false,
          duration: 0,
          error: cause instanceof Error ? cause.message : '请求失败',
        }
      }
    }))

    let allOk = true
    const badges = { ...connBadges.value }
    results.forEach((result, index) => {
      const id = ids[index]
      if (!id) return
      if (result.status === 'fulfilled' && result.value.ok) {
        badges[id] = {
          status: 'ok',
          duration: result.value.duration,
          error: '',
        }
      } else {
        allOk = false
        const fail = result.status === 'fulfilled' ? result.value : null
        badges[id] = {
          status: 'fail',
          duration: 0,
          error: fail?.error || '连接失败',
        }
      }
    })
    connBadges.value = badges
    testing.value = false
    testSummary.value = allOk ? 'all-ok' : 'partial-fail'
    testSummaryTimer = setTimeout(() => {
      testSummary.value = 'idle'
      testSummaryTimer = null
    }, 3000)
  }

  /** 把本次 Node 选择写回项目默认（失败静默，与 legacy 一致）。 */
  function persistNodeVersion(target: Project, selected: string) {
    if (selected === (target.nodeVersion || '')) return
    target.nodeVersion = selected
    void updateProject(target.name, { nodeVersion: selected }).catch(() => {})
  }

  function openLogViewer(buildOnly: boolean, target: Project, modules: string[]) {
    const labels = target.type === 'multi-module' ? modules : ['整体构建']
    log.open(
      {
        kind: 'deploy',
        id: null,
        projectName: target.name,
        title: buildOnly ? '构建进度' : '部署进度',
        subtitle: `${target.name} · ${labels.join(', ')}`,
      },
      { steps: buildOnly ? BUILD_STEPS : DEPLOY_STEPS, running: true },
    )
    log.setProgress({ percent: 0, indeterminate: false, label: '0%' })
  }

  async function executeBuild() {
    const target = project.value
    if (!target || submitting.value) return
    submitting.value = true
    error.value = ''
    const modules = [...selectedModules.value]
    writeJsonList(`last_${target.name}`, modules)
    persistNodeVersion(target, nodeVersion.value)

    const projectName = target.name
    const selectedNode = nodeVersion.value
    // 先占锁再关弹窗发请求——卡片忙态与 WS 归属都以 store.active 为判据
    task.begin(projectName)
    openLogViewer(true, target, modules)
    close()
    try {
      const data = await startBuild({
        projectName,
        modules,
        nodeVersion: selectedNode,
      })
      task.attachTaskId(data.id)
      log.attachTaskId(data.id)
    } catch (cause) {
      log.append(`请求失败: ${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
      task.abandon(projectName)
      log.setRunning(false)
    } finally {
      submitting.value = false
    }
  }

  async function executeDeploy(ids: string[]) {
    const target = project.value
    if (!target || submitting.value) return
    submitting.value = true
    error.value = ''
    pendingMultiConfirm.value = null
    const modules = [...selectedModules.value]
    writeJsonList(`last_${target.name}`, modules)
    persistNodeVersion(target, nodeVersion.value)

    const projectName = target.name
    const selectedNode = nodeVersion.value
    const path = remotePath.value
    task.begin(projectName)
    openLogViewer(false, target, modules)
    close()
    try {
      const data = await startDeploy({
        projectName,
        modules,
        serverIds: ids,
        serverId: ids[0] ?? '',
        remotePath: path,
        nodeVersion: selectedNode,
      })
      task.attachTaskId(data.id)
      log.attachTaskId(data.id)
    } catch (cause) {
      log.append(`请求失败: ${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
      task.abandon(projectName)
      log.setRunning(false)
    } finally {
      submitting.value = false
    }
  }

  /**
   * 点「开始构建 / 构建并部署」。多服务器时先挂确认，不立刻发起。
   * 返回 `'confirm'` 表示需要外层弹确认框；`'ok'` 已发起；`'blocked'` 校验未过。
   */
  async function submit(): Promise<'ok' | 'confirm' | 'blocked'> {
    const target = project.value
    if (!target || submitting.value) return 'blocked'

    if (target.type === 'multi-module' && selectedModules.value.length === 0) {
      error.value = '请至少选择一个模块'
      return 'blocked'
    }

    if (mode.value === 'build') {
      await executeBuild()
      return 'ok'
    }

    if (serverIds.value.length === 0) {
      error.value = '请至少选择一个目标服务器'
      return 'blocked'
    }

    const ids = [...serverIds.value]
    if (ids.length > 1) {
      const names = ids
        .map(id => servers.value.find(item => item.id === id)?.name || id)
        .join('、')
      pendingMultiConfirm.value = { serverIds: ids, names }
      return 'confirm'
    }

    await executeDeploy(ids)
    return 'ok'
  }

  async function confirmMultiDeploy() {
    const pending = pendingMultiConfirm.value
    if (!pending) return
    await executeDeploy(pending.serverIds)
  }

  function cancelMultiConfirm() {
    pendingMultiConfirm.value = null
  }

  return {
    mode,
    project,
    servers,
    open,
    isMulti,
    isDeploy,
    title,
    subtitle,
    selectedModules,
    favorites,
    moduleFilter,
    moduleQuery,
    visibleModules,
    moduleSections,
    nodeVersion,
    serverIds,
    remotePath,
    pathOptions,
    firstServer,
    gitBranch,
    gitCommits,
    submitting,
    testing,
    testSummary,
    connBadges,
    error,
    pendingMultiConfirm,
    handoff,
    openBuild,
    openHandoff,
    openDeploy,
    close,
    toggleModule,
    toggleAll,
    toggleFavorite,
    setServerChecked,
    applyRemotePath,
    remoteBrowserTarget,
    quickTest,
    submit,
    confirmMultiDeploy,
    cancelMultiConfirm,
  }
}
