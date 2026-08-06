import { ref } from 'vue'

/**
 * 项目分组的视图偏好：折叠态与自定义排序。
 *
 * 这两项是**纯视图偏好**，存 localStorage 而非项目实体（分组名本身才存在项目上）。
 * 沿用旧实现的键名，保证迁移后用户已有的折叠/排序状态不丢。
 *
 * 本地运行页与部署面板共用同一套分组语义，因此提升为共享 composable（CA-10）：
 *
 * - **排序键共享**：两页都用 `runGroupOrder`，上移/下移在两页同步生效。
 * - **折叠态各页独立**：本地运行页 `runCollapsedGroups`、部署面板
 *   `deployCollapsedGroups`。这是旧实现的刻意设计——两页关注的项目子集不同，
 *   折叠偏好不该互相干扰。
 */

/** 分组自定义顺序。两页共享，改动会同步反映到另一页。 */
const ORDER_KEY = 'runGroupOrder'

/** 未分组项目的聚合键，不会与真实分组名冲突。 */
export const UNGROUPED_KEY = '__ungrouped__'

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? raw.map(String) : []
  } catch {
    return []
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式下 localStorage 可能不可写，静默降级为「本次会话内有效」
  }
}

export interface ProjectGroupOptions {
  /** 折叠态存储键。两页各自独立，必须显式指定以免互相覆盖。 */
  collapsedKey: string
}

export function useProjectGroups(options: ProjectGroupOptions) {
  const collapsedKey = options.collapsedKey
  const collapsed = ref<string[]>(readList(collapsedKey))
  const order = ref<string[]>(readList(ORDER_KEY))

  const isCollapsed = (key: string) => collapsed.value.includes(key)

  function toggleCollapsed(key: string) {
    collapsed.value = isCollapsed(key)
      ? collapsed.value.filter(item => item !== key)
      : [...collapsed.value, key]
    writeList(collapsedKey, collapsed.value)
  }

  /** 具名分组按用户自定义顺序排列，未登记的新组按名称补在后。 */
  function sortGroups(names: string[]): string[] {
    const saved = order.value.filter(key => names.includes(key))
    const rest = names.filter(key => !saved.includes(key)).sort((a, b) => a.localeCompare(b, 'zh'))
    return [...saved, ...rest]
  }

  /** 以全部具名分组的全局顺序为基准移动，dir = -1 上移 / +1 下移。 */
  function moveGroup(allNames: string[], key: string, dir: -1 | 1) {
    const sorted = sortGroups(allNames)
    const from = sorted.indexOf(key)
    const to = from + dir
    if (from < 0 || to < 0 || to >= sorted.length) return
    ;[sorted[from], sorted[to]] = [sorted[to], sorted[from]]
    order.value = sorted
    writeList(ORDER_KEY, sorted)
  }

  /**
   * 分组重命名后同步迁移偏好：纯改名则原位替换；合并进已存在的组则删掉旧条目。
   * 不迁移会让用户的折叠态与排序在改名后凭空丢失。
   */
  function renameGroup(from: string, to: string) {
    if (isCollapsed(from)) {
      collapsed.value = collapsed.value.filter(item => item !== from)
      if (!collapsed.value.includes(to)) collapsed.value.push(to)
      writeList(collapsedKey, collapsed.value)
    }
    const index = order.value.indexOf(from)
    if (index !== -1) {
      const next = [...order.value]
      if (next.includes(to)) next.splice(index, 1)
      else next[index] = to
      order.value = next
      writeList(ORDER_KEY, next)
    }
  }

  return { collapsed, order, isCollapsed, toggleCollapsed, sortGroups, moveGroup, renameGroup }
}
