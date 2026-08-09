import { computed, ref } from 'vue'

import { updateProject, projectDefaultServerIds, type Project } from '@/services/modules/project-service'

/**
 * 项目默认配置弹窗的状态与提交。
 *
 * 取代 legacy `deploy.js` 的 `openProjectConfig` / `toggleConfigServer` /
 * `saveProjectConfig` 与两个模块级变量（`configProjectName`、`configCheckedServers`）。
 * 状态随组件私有化，避免旧实现里「关掉弹窗再开另一个项目时残留上次勾选」的隐患。
 */

export interface ProjectConfigState {
  displayName: string
  nodeVersion: string
  serverIds: string[]
}

export function useProjectConfig() {
  /** 正在配置的项目。null 表示弹窗关闭——与 RunConfigDialog 同一开合约定。 */
  const project = ref<Project | null>(null)
  const state = ref<ProjectConfigState>({ displayName: '', nodeVersion: '', serverIds: [] })
  const saving = ref(false)
  const error = ref('')

  const open = computed(() => project.value !== null)

  function openFor(target: Project) {
    project.value = target
    state.value = {
      displayName: target.displayName === target.name ? '' : target.displayName,
      nodeVersion: target.nodeVersion,
      // 读单值/数组两个字段的既有归一逻辑，不在页面里重新判断
      serverIds: [...projectDefaultServerIds(target)],
    }
    error.value = ''
  }

  function close() {
    project.value = null
    error.value = ''
  }

  function patch(next: Partial<ProjectConfigState>) {
    state.value = { ...state.value, ...next }
  }

  function toggleServer(id: string) {
    const ids = state.value.serverIds
    state.value = {
      ...state.value,
      serverIds: ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id],
    }
  }

  /**
   * 保存默认配置。成功返回项目名供调用方刷新列表。
   *
   * `displayName` 留空表示回落到文件夹名，与旧实现一致（后端存空串，
   * `normalizeProject` 再回落成 `name`）。
   */
  async function submit(): Promise<string | null> {
    const target = project.value
    if (!target || saving.value) return null
    saving.value = true
    error.value = ''
    try {
      const serverIds = [...state.value.serverIds]
      await updateProject(target.name, {
        displayName: state.value.displayName.trim(),
        nodeVersion: state.value.nodeVersion,
        // 单值字段必须一起写，见 DeployConfigPatch 的说明
        defaultServerId: serverIds[0] ?? '',
        defaultServerIds: serverIds,
      })
      project.value = null
      return target.name
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '未知错误'
      return null
    } finally {
      saving.value = false
    }
  }

  return { project, state, saving, error, open, openFor, close, patch, toggleServer, submit }
}
