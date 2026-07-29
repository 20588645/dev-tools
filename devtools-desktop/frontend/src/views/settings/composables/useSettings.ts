import { computed, reactive, ref } from 'vue'

import {
  EXPERIMENTAL_SETTING_CHANGED_EVENT,
  MENU_ORDER_CHANGED_EVENT,
  SIDECAR_RESTARTED_EVENT,
  UPGRADE_PROGRESS_EVENT,
  type ExperimentalSettingChangedDetail,
  type SidecarRestartedDetail,
  type UpgradeProgressDetail,
} from '@/legacy/legacy-bridge'
import { apiClient } from '@/services/api-client'
import {
  getReportConfig,
  saveReportConfig,
  type ReportConfig,
  type ReportRepoConfig,
} from '@/services/modules/report-service'
import * as settingsService from '@/services/modules/settings-service'
import { tauriClient } from '@/services/tauri-client'
import { useAppStore, type ThemeMode } from '@/stores/app'
import { useNotificationStore } from '@/stores/notification'
import { useSettingsStore } from '@/stores/settings'

export type SettingsCategory = 'general' | 'backup' | 'appearance' | 'git' | 'advanced' | 'about'
export type OperationState = 'idle' | 'working' | 'success' | 'error'
export type UpgradeState = 'idle' | 'confirming' | 'starting' | 'running' | 'finished' | 'error'

export interface SettingsSearchItem {
  id: string
  title: string
  description: string
  category: SettingsCategory
  keywords: string
}

export interface MenuItemDefinition {
  page: settingsService.SortableMenuPage
  label: string
}

export interface UseSettingsDependencies {
  service?: typeof settingsService
  getReportConfig?: typeof getReportConfig
  saveReportConfig?: typeof saveReportConfig
  storage?: Storage
  now?: () => Date
}

const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  general: '常规',
  backup: '数据与备份',
  appearance: '外观与通知',
  git: 'Git 活动',
  advanced: '高级',
  about: '关于',
}

export const SETTINGS_CATEGORIES = (Object.entries(CATEGORY_LABELS) as Array<[SettingsCategory, string]>)
  .map(([value, label], index) => ({ value, label, index: String(index + 1).padStart(2, '0') }))

export const settingsCategoryLabel = (category: SettingsCategory) => CATEGORY_LABELS[category]

export const MENU_ITEMS: MenuItemDefinition[] = [
  { page: 'run', label: '本地运行' },
  { page: 'deploy', label: '部署面板' },
  { page: 'filetransfer', label: '文件传输' },
  { page: 'terminal', label: '快捷命令' },
  { page: 'todo', label: '待办事项' },
  { page: 'notes', label: '工时内容' },
  { page: 'notebook', label: '个人笔记' },
  { page: 'editor', label: '文件编辑' },
  { page: 'ipcheck', label: '纯净检测' },
  { page: 'twofa', label: '2FA 验证码' },
  { page: 'usage', label: '用量统计' },
]

const SEARCH_ITEMS: SettingsSearchItem[] = [
  { id: 'sidecar', title: 'Sidecar 服务', description: '本地后端状态与重启', category: 'general', keywords: 'sidecar 后端 服务 重启' },
  { id: 'timeout', title: '连接超时', description: 'SSH 与远程操作等待时间', category: 'general', keywords: '服务器 连接 超时 ssh 秒' },
  { id: 'node', title: 'Node 版本', description: '当前 Sidecar 运行环境', category: 'general', keywords: 'node 版本 运行环境' },
  { id: 'scan', title: '项目扫描目录', description: '部署面板只读扫描路径', category: 'general', keywords: '项目 扫描 目录 路径' },
  { id: 'menu', title: '侧边栏顺序', description: '菜单上移、下移与恢复默认', category: 'general', keywords: '菜单 排序 上移 下移 恢复默认' },
  { id: 'backup', title: '数据备份', description: '创建、恢复、取消恢复与删除', category: 'backup', keywords: '数据库 自动 备份 恢复 删除 取消恢复' },
  { id: 'theme', title: '界面主题', description: '跟随系统、亮色或暗色', category: 'appearance', keywords: '主题 跟随系统 亮色 暗色 外观' },
  { id: 'notification', title: '系统通知', description: '任务提醒、权限与测试', category: 'appearance', keywords: '系统 通知 开关 macos 测试' },
  { id: 'experimental', title: '实验功能', description: 'Live2D 与点击粒子', category: 'appearance', keywords: '实验功能 live2d 看板娘 点击粒子 特效' },
  { id: 'git-config', title: 'Git 活动配置', description: 'Token、作者与仓库列表', category: 'git', keywords: 'gitlab token 密钥 作者 仓库 分支 分组' },
  { id: 'upgrade', title: '应用更新', description: '本地编译、覆盖安装与重启', category: 'advanced', keywords: '应用 更新 打包 安装 重启 升级' },
  { id: 'test-sidecar', title: '测试 Sidecar', description: '开发沙箱进程', category: 'advanced', keywords: '测试 沙箱 进程 开发服务 停止' },
  { id: 'data-location', title: '数据位置', description: '数据库与本地附件目录', category: 'about', keywords: '数据 位置 存储 路径' },
  { id: 'about', title: '关于 DevTools', description: '版本、架构与本地优先说明', category: 'about', keywords: '介绍 帮助 关于 软件信息 版本 架构' },
]

const cloneReportConfig = (config: ReportConfig): ReportConfig => ({
  token: config.token,
  author: config.author,
  outputDir: config.outputDir,
  repos: config.repos.map((repo) => ({ ...repo })),
})

const errorMessage = (reason: unknown, fallback: string) => (
  reason instanceof Error ? reason.message : String(reason || fallback)
)

export function formatBackupSize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1_024) return `${Math.round(bytes / 1_024)} KB`
  return `${bytes} B`
}

export function formatBackupTime(unixSeconds: number, now = new Date()) {
  if (!unixSeconds) return '未知时间'
  const date = new Date(unixSeconds * 1_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

export function useSettings(options: UseSettingsDependencies = {}) {
  const service = options.service ?? settingsService
  const readReportConfig = options.getReportConfig ?? getReportConfig
  const persistReportConfig = options.saveReportConfig ?? saveReportConfig
  const storage = options.storage ?? globalThis.localStorage
  const now = options.now ?? (() => new Date())
  const app = useAppStore()
  const settingsStore = useSettingsStore()
  const notifications = useNotificationStore()

  const activeCategory = ref<SettingsCategory>('general')
  const searchQuery = ref('')
  const initialized = ref(false)
  const loading = ref(false)
  const loadError = ref('')
  const backupsExpanded = ref(false)
  const experimentalExpanded = ref(false)
  const health = ref<settingsService.HealthInfo | null>(null)
  const nodeRuntime = ref<settingsService.NodeRuntimeInfo | null>(null)
  const backups = ref<settingsService.BackupRecord[]>([])
  const pendingRestore = ref(false)
  const testSidecarPids = ref<number[]>([])
  const notificationEnabled = ref(service.readNotificationEnabled(storage))
  const notificationPermission = ref<settingsService.NotificationPermissionState>('default')
  const experiments = service.readExperimentalPreferences(storage)
  const live2dEnabled = ref(experiments.live2dEnabled)
  const clickEffectEnabled = ref(experiments.clickEffectEnabled)
  const menuOrder = ref<settingsService.SortableMenuPage[]>(service.readMenuOrder(storage))
  const gitDraft = reactive<ReportConfig>({ token: '', author: '', outputDir: '', repos: [] })
  const savedGitConfig = ref<ReportConfig>({ token: '', author: '', outputDir: '', repos: [] })
  const gitSaveState = ref<OperationState>('idle')
  const connectionTimeoutDraft = ref(settingsStore.connectionTimeoutSec)
  const operation = reactive({
    restart: 'idle' as OperationState,
    backupCreate: 'idle' as OperationState,
    backupRestore: 'idle' as OperationState,
    backupCancel: 'idle' as OperationState,
    backupDelete: 'idle' as OperationState,
    testSidecarKill: 'idle' as OperationState,
    notification: 'idle' as OperationState,
  })
  const upgrade = reactive({
    state: 'idle' as UpgradeState,
    percent: 0,
    log: '',
    message: '',
  })

  let loadController: AbortController | null = null
  let loadVersion = 0

  const query = computed(() => searchQuery.value.trim().toLocaleLowerCase('zh-CN'))
  const searchResults = computed(() => {
    if (!query.value) return []
    return SEARCH_ITEMS.filter((item) => (
      `${item.title} ${item.description} ${item.keywords} ${CATEGORY_LABELS[item.category]}`
        .toLocaleLowerCase('zh-CN')
        .includes(query.value)
    ))
  })
  const gitDirty = computed(() => JSON.stringify(gitDraft) !== JSON.stringify(savedGitConfig.value))
  const visibleBackups = computed(() => backupsExpanded.value ? backups.value : backups.value.slice(0, 3))
  const latestBackupLabel = computed(() => (
    backups.value[0] ? formatBackupTime(backups.value[0].createdAt, now()) : '暂无备份'
  ))
  const sidecarLabel = computed(() => {
    if (loading.value && !health.value) return '检测中'
    if (!health.value) return '离线'
    const port = app.sidecarPort ?? Number(new URL(apiClient.baseURL || 'http://127.0.0.1').port)
    return port ? `在线 · ${port}` : '在线'
  })
  const notificationLabel = computed(() => {
    if (!notificationEnabled.value) return '已关闭'
    if (notificationPermission.value === 'granted') return '已授权'
    if (notificationPermission.value === 'denied') return '权限已拒绝'
    if (notificationPermission.value === 'unsupported') return '当前环境不支持'
    return '等待授权'
  })
  const menuItems = computed(() => menuOrder.value.map((page) => (
    MENU_ITEMS.find((item) => item.page === page) as MenuItemDefinition
  )).filter(Boolean))
  const showTestSidecars = computed(() => (
    import.meta.env.DEV
    && new URLSearchParams(globalThis.location?.search ?? '').get('apiPort') === '13900'
  ))

  const refreshBackups = async (signal?: AbortSignal) => {
    const snapshot = await service.getBackups(signal)
    backups.value = snapshot.backups
    pendingRestore.value = snapshot.pendingRestore
  }

  const refreshHealth = async (signal?: AbortSignal) => {
    health.value = await service.getHealth(signal)
    app.sidecarStatus = 'online'
    if (apiClient.baseURL) app.sidecarPort = Number(new URL(apiClient.baseURL).port) || null
  }

  const refreshTestSidecars = async (signal?: AbortSignal) => {
    if (!showTestSidecars.value) {
      testSidecarPids.value = []
      return
    }
    testSidecarPids.value = (await service.getTestSidecars(signal)).pids
  }

  const initialize = async (force = false) => {
    if (loading.value || (initialized.value && !force)) return
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    const version = ++loadVersion
    loading.value = true
    loadError.value = ''

    const tasks: Promise<unknown>[] = [
      refreshHealth(controller.signal),
      refreshBackups(controller.signal),
      refreshTestSidecars(controller.signal),
      settingsStore.load({ force, signal: controller.signal }).then(() => {
        connectionTimeoutDraft.value = settingsStore.connectionTimeoutSec
      }),
      service.getNotificationPermission().then((value) => { notificationPermission.value = value }),
    ]
    if (!nodeRuntime.value) {
      tasks.push(service.getNodeRuntime(controller.signal).then((value) => { nodeRuntime.value = value }))
    }
    // Re-entering Settings refreshes volatile runtime state, but must not erase
    // a Git form the user intentionally left unsaved.
    if (!initialized.value || !gitDirty.value) {
      tasks.push(readReportConfig().then((value) => {
        Object.assign(gitDraft, cloneReportConfig(value))
        savedGitConfig.value = cloneReportConfig(value)
      }))
    }
    const results = await Promise.allSettled(tasks)
    if (controller.signal.aborted || version !== loadVersion) return
    const rejected = results.filter((result) => result.status === 'rejected')
    if (rejected.length) {
      loadError.value = rejected.length === tasks.length
        ? '设置数据加载失败，请检查 Sidecar 状态'
        : `部分设置暂时无法读取（${rejected.length} 项）`
    }
    initialized.value = true
    loading.value = false
    loadController = null
  }

  const dispose = () => {
    loadVersion += 1
    loadController?.abort()
    loadController = null
    window.removeEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
  }

  const chooseSearchResult = (item: SettingsSearchItem) => {
    activeCategory.value = item.category
    searchQuery.value = ''
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-setting-id="${item.id}"]`)?.focus({ preventScroll: false })
    })
  }

  const saveConnectionTimeout = async () => {
    try {
      const value = await settingsStore.saveConnectionTimeout(connectionTimeoutDraft.value)
      connectionTimeoutDraft.value = value
      window.dispatchEvent(new CustomEvent('devtools:connection-timeout-changed', {
        detail: { seconds: value },
      }))
      notifications.push(`连接超时已设为 ${value} 秒`, 'success')
    } catch (reason) {
      notifications.push(errorMessage(reason, '连接超时保存失败'), 'error')
    }
  }

  const setThemeMode = (mode: string) => {
    app.applyThemeMode(mode as ThemeMode)
  }

  const toggleNotification = async (enabled: boolean) => {
    notificationEnabled.value = enabled
    service.writeNotificationEnabled(enabled, storage)
    if (!enabled) return
    operation.notification = 'working'
    notificationPermission.value = await service.requestNotificationPermission()
    operation.notification = notificationPermission.value === 'granted' ? 'success' : 'error'
    if (notificationPermission.value !== 'granted') {
      notifications.push('系统通知未授权，请在 macOS 系统设置中允许 DevTools 发送通知', 'warning')
    }
  }

  const testNotification = async () => {
    operation.notification = 'working'
    try {
      if (notificationPermission.value !== 'granted') {
        notificationPermission.value = await service.requestNotificationPermission()
      }
      if (notificationPermission.value !== 'granted') throw new Error('系统通知尚未授权')
      notificationEnabled.value = true
      service.writeNotificationEnabled(true, storage)
      await service.sendTestNotification()
      operation.notification = 'success'
      notifications.push('测试通知已发送', 'success')
    } catch (reason) {
      operation.notification = 'error'
      notifications.push(errorMessage(reason, '测试通知发送失败'), 'error')
    }
  }

  const updateExperiment = (key: ExperimentalSettingChangedDetail['key'], enabled: boolean) => {
    if (key === 'live2d') live2dEnabled.value = enabled
    else clickEffectEnabled.value = enabled
    service.writeExperimentalPreference(key, enabled, storage)
    window.dispatchEvent(new CustomEvent<ExperimentalSettingChangedDetail>(
      EXPERIMENTAL_SETTING_CHANGED_EVENT,
      { detail: { key, enabled } },
    ))
  }

  const persistMenuOrder = () => {
    service.writeMenuOrder(menuOrder.value, storage)
    window.dispatchEvent(new CustomEvent(MENU_ORDER_CHANGED_EVENT))
  }

  const moveMenuItem = (page: settingsService.SortableMenuPage, direction: 'up' | 'down') => {
    const index = menuOrder.value.indexOf(page)
    const next = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || next < 0 || next >= menuOrder.value.length) return
    const order = [...menuOrder.value]
    ;[order[index], order[next]] = [order[next], order[index]]
    menuOrder.value = order
    persistMenuOrder()
  }

  const resetMenuOrder = () => {
    service.resetSavedMenuOrder(storage)
    menuOrder.value = [...settingsService.DEFAULT_MENU_ORDER]
    window.dispatchEvent(new CustomEvent(MENU_ORDER_CHANGED_EVENT))
    notifications.push('侧边栏顺序已恢复默认', 'success')
  }

  const saveGitConfig = async () => {
    gitSaveState.value = 'working'
    try {
      const normalized = cloneReportConfig(gitDraft)
      normalized.repos = normalized.repos.filter((repo) => repo.repo.trim())
      await persistReportConfig(normalized)
      Object.assign(gitDraft, cloneReportConfig(normalized))
      savedGitConfig.value = cloneReportConfig(normalized)
      gitSaveState.value = 'success'
      notifications.push('Git 活动配置已保存', 'success')
    } catch (reason) {
      gitSaveState.value = 'error'
      notifications.push(errorMessage(reason, 'Git 活动配置保存失败'), 'error')
    }
  }

  const addRepository = () => {
    gitDraft.repos.push({ repo: '', branch: '', group: '' })
  }

  const removeRepository = (index: number) => {
    gitDraft.repos.splice(index, 1)
  }

  const updateRepository = (index: number, field: keyof ReportRepoConfig, value: string) => {
    if (gitDraft.repos[index]) gitDraft.repos[index][field] = value
  }

  const createBackup = async () => {
    operation.backupCreate = 'working'
    try {
      const result = await service.createBackup()
      await refreshBackups()
      operation.backupCreate = 'success'
      notifications.push(result.file ? `备份已创建：${result.file}` : '备份已创建', 'success')
    } catch (reason) {
      operation.backupCreate = 'error'
      notifications.push(errorMessage(reason, '备份创建失败'), 'error')
    }
  }

  const restoreBackup = async (file: string) => {
    operation.backupRestore = 'working'
    try {
      await service.stageBackupRestore(file)
      await refreshBackups()
      operation.backupRestore = 'success'
      notifications.push('恢复已暂存，重启 Sidecar 后生效', 'success')
    } catch (reason) {
      operation.backupRestore = 'error'
      notifications.push(errorMessage(reason, '备份恢复失败'), 'error')
    }
  }

  const cancelRestore = async () => {
    operation.backupCancel = 'working'
    try {
      await service.cancelBackupRestore()
      await refreshBackups()
      operation.backupCancel = 'success'
      notifications.push('已取消待生效的恢复', 'success')
    } catch (reason) {
      operation.backupCancel = 'error'
      notifications.push(errorMessage(reason, '取消恢复失败'), 'error')
    }
  }

  const removeBackup = async (file: string) => {
    operation.backupDelete = 'working'
    try {
      await service.deleteBackup(file)
      await refreshBackups()
      operation.backupDelete = 'success'
      notifications.push(`已删除备份：${file}`, 'success')
    } catch (reason) {
      operation.backupDelete = 'error'
      notifications.push(errorMessage(reason, '备份删除失败'), 'error')
    }
  }

  const restartSidecar = async () => {
    operation.restart = 'working'
    try {
      if (!tauriClient.available) throw new Error('仅桌面应用内可以重启 Sidecar')
      const port = await tauriClient.restartSidecar()
      apiClient.setBaseUrl(`http://127.0.0.1:${port}`)
      app.sidecarPort = port
      app.sidecarStatus = 'checking'
      window.dispatchEvent(new CustomEvent<SidecarRestartedDetail>(
        SIDECAR_RESTARTED_EVENT,
        { detail: { port } },
      ))
      await new Promise((resolve) => globalThis.setTimeout(resolve, 600))
      await Promise.all([refreshHealth(), refreshBackups()])
      operation.restart = 'success'
      notifications.push(`Sidecar 已重启并连接到端口 ${port}`, 'success')
    } catch (reason) {
      app.sidecarStatus = 'offline'
      operation.restart = 'error'
      notifications.push(errorMessage(reason, 'Sidecar 重启失败'), 'error')
    }
  }

  const stopTestSidecars = async () => {
    operation.testSidecarKill = 'working'
    try {
      const result = await service.killTestSidecars()
      testSidecarPids.value = []
      operation.testSidecarKill = 'success'
      notifications.push(result.killed ? `已停止 ${result.killed} 个测试 Sidecar` : '没有运行中的测试 Sidecar', 'success')
    } catch (reason) {
      operation.testSidecarKill = 'error'
      notifications.push(errorMessage(reason, '停止测试 Sidecar 失败'), 'error')
    }
  }

  function handleUpgradeProgress(detail: UpgradeProgressDetail) {
    if (typeof detail.percent === 'number') {
      upgrade.percent = Math.min(Math.max(detail.percent, 0), 100)
    }
    if (detail.log) upgrade.log += detail.log
    if (detail.event === 'Started' || detail.event === 'Progress') upgrade.state = 'running'
    if (detail.event === 'Error') {
      upgrade.state = 'error'
      upgrade.message = '更新失败，请查看任务日志'
    }
    if (detail.event === 'Finished') {
      upgrade.state = 'finished'
      upgrade.percent = 100
      upgrade.message = '更新完成，应用即将自动退出并重启'
      globalThis.setTimeout(() => {
        void tauriClient.exitApp().catch(() => undefined)
      }, 500)
    }
  }

  function handleUpgradeProgressEvent(event: Event) {
    handleUpgradeProgress((event as CustomEvent<UpgradeProgressDetail>).detail ?? {})
  }

  const bindUpgradeProgress = () => {
    window.removeEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
    window.addEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
  }

  const requestUpgrade = () => {
    upgrade.state = 'confirming'
  }

  const beginUpgrade = async () => {
    upgrade.state = 'starting'
    upgrade.percent = 0
    upgrade.log = '准备开始本地更新任务…\n'
    upgrade.message = '正在启动更新任务'
    try {
      await service.startUpgrade()
      if (upgrade.state === 'starting') upgrade.state = 'running'
    } catch (reason) {
      upgrade.state = 'error'
      upgrade.message = errorMessage(reason, '更新任务启动失败')
      upgrade.log += `[ERROR] ${upgrade.message}\n`
    }
  }

  const closeUpgrade = () => {
    if (upgrade.state === 'starting' || upgrade.state === 'running') return
    upgrade.state = 'idle'
  }

  bindUpgradeProgress()

  return {
    app,
    settingsStore,
    activeCategory,
    searchQuery,
    searchResults,
    initialized,
    loading,
    loadError,
    health,
    nodeRuntime,
    backups,
    visibleBackups,
    backupsExpanded,
    pendingRestore,
    testSidecarPids,
    notificationEnabled,
    notificationPermission,
    notificationLabel,
    live2dEnabled,
    clickEffectEnabled,
    experimentalExpanded,
    menuOrder,
    menuItems,
    gitDraft,
    gitDirty,
    gitSaveState,
    connectionTimeoutDraft,
    operation,
    upgrade,
    latestBackupLabel,
    sidecarLabel,
    showTestSidecars,
    initialize,
    dispose,
    chooseSearchResult,
    saveConnectionTimeout,
    setThemeMode,
    toggleNotification,
    testNotification,
    updateExperiment,
    moveMenuItem,
    resetMenuOrder,
    saveGitConfig,
    addRepository,
    removeRepository,
    updateRepository,
    createBackup,
    restoreBackup,
    cancelRestore,
    removeBackup,
    restartSidecar,
    stopTestSidecars,
    requestUpgrade,
    beginUpgrade,
    closeUpgrade,
    handleUpgradeProgress,
  }
}

export type SettingsController = ReturnType<typeof useSettings>
