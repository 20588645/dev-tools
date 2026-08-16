import { computed, ref, shallowRef } from 'vue'

import { UNGROUPED_KEY, useProjectGroups } from '@/composables/use-project-groups'
import { getLastDeploy, type LastDeployInfo } from '@/services/modules/deploy-service'
import {
  getProjects,
  projectDefaultServerIds,
  updateProject,
  type Project,
} from '@/services/modules/project-service'

/**
 * 项目总览子页的数据与视图状态。
 *
 * 分组语义由共享的 `useProjectGroups` 提供（与本地运行页同源，见其文档）。
 */

export type DeployFilter = 'all' | 'multi' | 'single' | 'configured' | 'unconfigured'

export interface DeployGroupView {
  key: string
  label: string
  isUngrouped: boolean
  projects: Project[]
  collapsed: boolean
  /** 该组内已配置发布目标的项目数（直连看服务器，网关看设备 IP）。 */
  configuredCount: number
  index: number
  total: number
}

export function useDeployDashboard(options: {
  isProjectConfigured?: (project: Project) => boolean
} = {}) {
  const groups = useProjectGroups({ collapsedKey: 'deployCollapsedGroups' })
  const projects = shallowRef<Project[]>([])
  /** projectName → 最近构建/部署摘要。异步补齐，不阻塞卡片首次渲染。 */
  const lastDeploys = ref<Record<string, LastDeployInfo | null>>({})
  const loading = ref(false)
  const error = ref('')
  const query = ref('')
  const filter = ref<DeployFilter>('all')

  function isProjectConfigured(project: Project) {
    if (options.isProjectConfigured) return options.isProjectConfigured(project)
    return projectDefaultServerIds(project).length > 0
  }

  const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    return projects.value.filter((project) => {
      if (keyword) {
        const haystack = `${project.displayName} ${project.name} ${project.path}`.toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      const configured = isProjectConfigured(project)
      switch (filter.value) {
        case 'multi': return project.type === 'multi-module'
        case 'single': return project.type === 'single'
        case 'configured': return configured
        case 'unconfigured': return !configured
        default: return true
      }
    })
  })

  /** 只要有项目带分组名就用分组布局，否则平铺（与旧实现一致）。 */
  const useGroupedLayout = computed(() => projects.value.some(project => project.groupName))

  const namedGroups = computed(() => (
    [...new Set(filtered.value.map(project => project.groupName).filter(Boolean))]
  ))

  const groupViews = computed<DeployGroupView[]>(() => {
    const sorted = groups.sortGroups(namedGroups.value)
    const ungrouped = filtered.value.filter(project => !project.groupName)
    const keys = ungrouped.length > 0 ? [...sorted, UNGROUPED_KEY] : sorted

    return keys.map((key, index) => {
      const isUngrouped = key === UNGROUPED_KEY
      const items = isUngrouped ? ungrouped : filtered.value.filter(project => project.groupName === key)
      return {
        key,
        label: isUngrouped ? '未分组' : key,
        isUngrouped,
        projects: items,
        collapsed: groups.isCollapsed(key),
        configuredCount: items.filter(isProjectConfigured).length,
        index,
        total: keys.length,
      }
    })
  })

  const stats = computed(() => {
    const total = projects.value.length
    const configured = projects.value.filter(isProjectConfigured).length
    return {
      total,
      configured,
      multiModule: projects.value.filter(p => p.type === 'multi-module').length,
    }
  })

  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) loading.value = true
    error.value = ''
    try {
      projects.value = await getProjects()
      void loadLastDeploys()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载项目失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 批量补齐「最近构建/部署」。
   *
   * 逐个请求且不阻塞渲染：这是卡片上的辅助信息，任一项失败只让该卡显示
   * 「暂无记录」，不能影响整页。与旧 `loadLastDeployInfos` 行为一致。
   */
  async function loadLastDeploys() {
    const names = projects.value.map(project => project.name)
    const results = await Promise.all(names.map(async (name) => {
      try {
        return [name, await getLastDeploy(name)] as const
      } catch {
        return [name, null] as const
      }
    }))
    lastDeploys.value = Object.fromEntries(results)
  }

  function lastDeployOf(projectName: string): LastDeployInfo | null {
    return lastDeploys.value[projectName] ?? null
  }

  /** 重命名分组：逐个更新受影响项目的 groupName，并迁移本地折叠/排序偏好。 */
  async function renameGroup(from: string, to: string) {
    const affected = projects.value.filter(project => project.groupName === from)
    for (const project of affected) {
      await updateProject(project.name, { groupName: to })
    }
    projects.value = projects.value.map(project => (
      project.groupName === from ? { ...project, groupName: to } : project
    ))
    groups.renameGroup(from, to)
  }

  function moveGroup(key: string, dir: -1 | 1) {
    groups.moveGroup(namedGroups.value, key, dir)
  }

  return {
    projects,
    loading,
    error,
    query,
    filter,
    filtered,
    useGroupedLayout,
    groupViews,
    groupNames: namedGroups,
    stats,
    load,
    lastDeployOf,
    toggleGroup: groups.toggleCollapsed,
    moveGroup,
    renameGroup,
  }
}
