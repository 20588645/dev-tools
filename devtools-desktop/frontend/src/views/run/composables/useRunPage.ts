import { computed, ref, shallowRef } from 'vue'

import {
  getProjects,
  inferRunCommand,
  updateProject,
  type Project,
  type RunConfigPatch,
} from '@/services/modules/project-service'
import { useRunStore } from '@/stores/run'

import { UNGROUPED_KEY, useRunGroups } from './useRunGroups'

/** 项目筛选档位，与旧实现四个 chip 一致。 */
export type RunFilter = 'all' | 'running' | 'multi' | 'single'

export interface RunGroupView {
  key: string
  /** 展示名；未分组组显示「未分组」。 */
  label: string
  isUngrouped: boolean
  projects: Project[]
  collapsed: boolean
  runningCount: number
  /** 在全部具名分组中的位置，用于禁用首尾的上移/下移。 */
  index: number
  total: number
}

export function useRunPage() {
  const store = useRunStore()
  const groups = useRunGroups()

  const projects = shallowRef<Project[]>([])
  const query = ref('')
  const filter = ref<RunFilter>('all')
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')

  /** 首屏失败要给重试入口；后台刷新失败只提示、保留旧数据。 */
  async function load(options: { silent?: boolean } = {}) {
    const isFirstLoad = projects.value.length === 0
    if (options.silent || !isFirstLoad) refreshing.value = true
    else loading.value = true
    error.value = ''
    try {
      const [list] = await Promise.all([getProjects(), store.reconcile()])
      projects.value = list
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '加载项目失败'
      // 已有数据时不清屏，避免一次瞬时失败让整页变空
      if (isFirstLoad) error.value = message
      return false
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    let list = projects.value.filter(project => !keyword
      || project.name.toLowerCase().includes(keyword)
      || project.displayName.toLowerCase().includes(keyword)
      || project.path.toLowerCase().includes(keyword))

    if (filter.value === 'running') list = list.filter(p => store.activeJobs[p.name])
    else if (filter.value === 'multi') list = list.filter(p => p.type === 'multi-module')
    else if (filter.value === 'single') list = list.filter(p => p.type === 'single')

    // 运行中的项目置顶，其余保持原序
    return [...list].sort((a, b) => {
      const aRunning = store.activeJobs[a.name] ? 1 : 0
      const bRunning = store.activeJobs[b.name] ? 1 : 0
      return bRunning - aRunning
    })
  })

  /** 全部具名分组（含被筛选隐藏的），moveGroup 需要以全局顺序为基准。 */
  const allGroupNames = computed(() => groups.sortGroups(
    [...new Set(projects.value.map(p => p.groupName).filter(Boolean))],
  ))

  const hasGroups = computed(() => projects.value.some(p => p.groupName))

  /**
   * 分组视图。以下两种情况退回平铺，避免只剩一个孤零零的「未分组」头：
   * - 没有任何项目设置过分组
   * - 当前可见项里不含任何具名分组
   */
  const groupViews = computed<RunGroupView[]>(() => {
    if (!hasGroups.value) return []
    const buckets = new Map<string, Project[]>()
    for (const project of filtered.value) {
      const key = project.groupName || UNGROUPED_KEY
      const bucket = buckets.get(key)
      if (bucket) bucket.push(project)
      else buckets.set(key, [project])
    }
    const named = allGroupNames.value.filter(key => buckets.has(key))
    if (named.length === 0) return []

    const keys = buckets.has(UNGROUPED_KEY) ? [...named, UNGROUPED_KEY] : named
    return keys.map((key) => {
      const items = buckets.get(key) ?? []
      const isUngrouped = key === UNGROUPED_KEY
      return {
        key,
        label: isUngrouped ? '未分组' : key,
        isUngrouped,
        projects: items,
        collapsed: groups.isCollapsed(key),
        runningCount: items.filter(p => store.activeJobs[p.name]).length,
        index: isUngrouped ? -1 : allGroupNames.value.indexOf(key),
        total: allGroupNames.value.length,
      }
    })
  })

  const useGroupedLayout = computed(() => groupViews.value.length > 0)

  const stats = computed(() => ({
    total: projects.value.length,
    running: store.runningCount,
    multiModule: projects.value.filter(p => p.type === 'multi-module').length,
  }))

  /** 现有分组名，供配置弹窗下拉选择。 */
  const groupNames = computed(() => allGroupNames.value)

  function projectOf(name: string): Project | null {
    return projects.value.find(p => p.name === name) ?? null
  }

  function commandOf(project: Project): string {
    return inferRunCommand(project)
  }

  /**
   * 收藏模块列表：过滤掉已不存在的模块，并按需带上首页模块。
   * 不过滤会让删掉的模块残留在快捷启动里，点了必然失败。
   */
  function favoriteModulesOf(project: Project): string[] {
    const moduleNames = project.modules.map(m => m.name)
    const valid = project.favoriteRunModules.filter(
      name => moduleNames.some(m => m.toLowerCase() === name.toLowerCase()),
    )
    const home = project.runHomeModule.trim() || 'home'
    if (project.runIncludeHome && !valid.some(name => name.toLowerCase() === home.toLowerCase())) {
      valid.push(home)
    }
    return valid
  }

  /** 保存运行配置并就地更新本地副本，避免整页重拉。 */
  async function saveConfig(name: string, patch: RunConfigPatch) {
    await updateProject(name, patch)
    projects.value = projects.value.map(project => (
      project.name === name ? { ...project, ...patch } : project
    ))
  }

  /** 分组重命名：逐个改所属项目的 groupName，并迁移折叠/排序偏好。 */
  async function renameGroup(from: string, to: string) {
    const affected = projects.value.filter(p => p.groupName === from)
    for (const project of affected) {
      await updateProject(project.name, { groupName: to })
    }
    projects.value = projects.value.map(project => (
      project.groupName === from ? { ...project, groupName: to } : project
    ))
    groups.renameGroup(from, to)
  }

  function moveGroup(key: string, dir: -1 | 1) {
    groups.moveGroup([...new Set(projects.value.map(p => p.groupName).filter(Boolean))], key, dir)
  }

  return {
    store,
    projects,
    query,
    filter,
    loading,
    refreshing,
    error,
    filtered,
    groupViews,
    useGroupedLayout,
    stats,
    groupNames,
    load,
    projectOf,
    commandOf,
    favoriteModulesOf,
    saveConfig,
    renameGroup,
    moveGroup,
    toggleGroup: groups.toggleCollapsed,
  }
}
