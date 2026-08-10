import { computed, ref, shallowRef } from 'vue'

import {
  addProjects,
  browseProjects,
  getAvailableProjects,
  type AvailableProject,
  type BrowseEntry,
} from '@/services/modules/deploy-service'

/**
 * 添加项目弹窗的状态与提交。
 *
 * 取代 legacy `deploy.js` 的 `showAddProject` / `switchAddMode` /
 * `renderAvailableProjects` / `toggleAvailableProject` / `toggleAllAvailable` /
 * `filterAvailableProjects` / `browseTo` / `renderBrowseBreadcrumb` /
 * `renderBrowseList` / `toggleBrowseProject` / `updateAddSubmitBtn` /
 * `addSelectedProjects` 共 12 个函数，以及 `currentAddMode` /
 * `checkedBrowseProjects` 两个模块级变量与 `app.js` 的 `availableProjects` /
 * `checkedAvailableProjects` 两个全局。
 *
 * 两种模式各自维护勾选集：切模式不清对方的选择（与旧实现一致），但提交只取
 * 当前模式的那一份。
 */

export type AddProjectMode = 'scan' | 'browse'

/** 扫描面板三种空态的区分依据，避免共用一句误导文案。 */
export type ScanEmptyKind = 'none-found' | 'no-match' | 'all-added'

export interface BreadcrumbSegment {
  label: string
  path: string
}

export function useAddProject() {
  const open = ref(false)
  const mode = ref<AddProjectMode>('scan')

  /* 自动扫描 */
  const available = shallowRef<AvailableProject[]>([])
  const scanChecked = ref<Set<string>>(new Set())
  const query = ref('')
  const scanLoading = ref(false)

  /* 手动浏览 */
  const entries = shallowRef<BrowseEntry[]>([])
  const browseChecked = ref<Set<string>>(new Set())
  const currentDir = ref('')
  const root = ref('')
  const browseLoading = ref(false)

  const submitting = ref(false)
  /** 取数或提交失败的原因，交由弹窗内展示，不弹全局 alert 打断流程。 */
  const error = ref('')

  const visibleAvailable = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    return keyword
      ? available.value.filter(item => item.name.toLowerCase().includes(keyword))
      : available.value
  })

  const scanEmptyKind = computed<ScanEmptyKind>(() => {
    if (available.value.length === 0) return 'none-found'
    return query.value.trim() ? 'no-match' : 'all-added'
  })

  /** 面包屑：根目录固定首段，其余按当前路径相对根的层级展开。 */
  const breadcrumbs = computed<BreadcrumbSegment[]>(() => {
    if (!root.value) return []
    const segments: BreadcrumbSegment[] = [{ label: 'project', path: root.value }]
    const rel = currentDir.value.startsWith(root.value)
      ? currentDir.value.slice(root.value.length).replace(/^\//, '')
      : ''
    let accum = root.value
    for (const part of rel ? rel.split('/') : []) {
      accum = `${accum}/${part}`
      segments.push({ label: part, path: accum })
    }
    return segments
  })

  /** 当前模式下已勾选的路径。提交与按钮文案都以它为准。 */
  const selectedPaths = computed(() => (
    mode.value === 'scan' ? [...scanChecked.value] : [...browseChecked.value]
  ))

  const submitLabel = computed(() => (
    selectedPaths.value.length > 0 ? `添加 ${selectedPaths.value.length} 个项目` : '添加选中项目'
  ))

  async function loadAvailable() {
    scanLoading.value = true
    error.value = ''
    try {
      available.value = await getAvailableProjects()
    } catch (cause) {
      available.value = []
      error.value = `获取可用项目失败：${cause instanceof Error ? cause.message : '未知错误'}`
    } finally {
      scanLoading.value = false
    }
  }

  async function browseTo(dir?: string) {
    browseLoading.value = true
    error.value = ''
    try {
      const result = await browseProjects(dir)
      entries.value = result.entries
      currentDir.value = result.currentDir
      root.value = result.root
    } catch (cause) {
      entries.value = []
      error.value = `浏览目录失败：${cause instanceof Error ? cause.message : '未知错误'}`
    } finally {
      browseLoading.value = false
    }
  }

  async function show() {
    open.value = true
    mode.value = 'scan'
    query.value = ''
    scanChecked.value = new Set()
    browseChecked.value = new Set()
    entries.value = []
    currentDir.value = ''
    root.value = ''
    await loadAvailable()
  }

  function close() {
    open.value = false
    error.value = ''
  }

  /** 切到手动浏览时才发浏览请求；已加载过就沿用当前目录，不重复取数。 */
  async function switchMode(next: AddProjectMode) {
    mode.value = next
    if (next === 'browse' && !root.value) await browseTo()
  }

  function toggleScan(path: string) {
    const set = new Set(scanChecked.value)
    if (set.has(path)) set.delete(path)
    else set.add(path)
    scanChecked.value = set
  }

  /** 全选只作用于当前搜索结果，与用户所见一致（旧实现会连过滤掉的一起选上）。 */
  function toggleAllScan(select: boolean) {
    if (!select) {
      scanChecked.value = new Set()
      return
    }
    const set = new Set(scanChecked.value)
    for (const item of visibleAvailable.value) set.add(item.path)
    scanChecked.value = set
  }

  function toggleBrowse(path: string) {
    const set = new Set(browseChecked.value)
    if (set.has(path)) set.delete(path)
    else set.add(path)
    browseChecked.value = set
  }

  /**
   * 提交批量添加。成功返回结果摘要供调用方提示并刷新列表，失败返回 null 并
   * 把原因写进 `error`。
   */
  async function submit() {
    const paths = selectedPaths.value
    if (paths.length === 0 || submitting.value) return null
    submitting.value = true
    error.value = ''
    try {
      const result = await addProjects(paths)
      open.value = false
      return result
    } catch (cause) {
      error.value = `添加失败：${cause instanceof Error ? cause.message : '未知错误'}`
      return null
    } finally {
      submitting.value = false
    }
  }

  return {
    open,
    mode,
    available,
    visibleAvailable,
    scanChecked,
    scanEmptyKind,
    scanLoading,
    query,
    entries,
    browseChecked,
    breadcrumbs,
    browseLoading,
    selectedPaths,
    submitLabel,
    submitting,
    error,
    show,
    close,
    switchMode,
    browseTo,
    toggleScan,
    toggleAllScan,
    toggleBrowse,
    submit,
  }
}
