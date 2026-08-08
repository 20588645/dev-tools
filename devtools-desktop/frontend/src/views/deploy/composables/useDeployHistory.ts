import { computed, ref, shallowRef } from 'vue'

import {
  cleanupHistory,
  deleteHistoryItem,
  deleteHistoryItems,
  getHistory,
  type CleanupInput,
  type HistoryItem,
} from '@/services/modules/deploy-service'

/** 类型筛选值。`all` 之外与后端 `type` 字段同值。 */
export type HistoryTypeFilter = 'all' | 'deploy' | 'build-only'
/**
 * 状态筛选值。
 *
 * 注意用的是 service 内部值 `error`（`normalizeHistoryItem` 把后端的 `fail`
 * 折叠成 `error`），照搬 legacy 的 `fail` 会让失败筛选永远为空。
 */
export type HistoryStatusFilter = 'all' | 'success' | 'error'

export function useDeployHistory() {
  const items = shallowRef<HistoryItem[]>([])
  const loading = ref(false)
  const error = ref('')
  const typeFilter = ref<HistoryTypeFilter>('all')
  const statusFilter = ref<HistoryStatusFilter>('all')

  /** 批量选择模式与已选 id。退出模式时清空，与旧实现一致。 */
  const batchMode = ref(false)
  const selectedIds = ref<Set<string>>(new Set())

  const filtered = computed(() => items.value.filter((item) => {
    if (typeFilter.value !== 'all' && item.type !== typeFilter.value) return false
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    return true
  }))

  const stats = computed(() => {
    const total = items.value.length
    const success = items.value.filter(item => item.status === 'success').length
    return {
      total,
      success,
      failed: total - success,
      /** 仅在筛选生效时展示，与旧实现的「当前筛选 N 条」一致。 */
      filteredCount: filtered.value.length === total ? null : filtered.value.length,
    }
  })

  const selectedCount = computed(() => selectedIds.value.size)

  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) loading.value = true
    error.value = ''
    try {
      items.value = await getHistory()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '加载历史失败'
      // 首屏失败给整页失败态；已有数据时交给调用方走 toast 并保留旧表
      if (items.value.length === 0) error.value = message
      else throw cause
    } finally {
      loading.value = false
    }
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value
    selectedIds.value = new Set()
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  /** 本地移除已删记录，避免整表重取（与旧实现一致）。 */
  function dropLocally(ids: string[]) {
    const removed = new Set(ids)
    items.value = items.value.filter(item => !removed.has(item.id))
    const next = new Set(selectedIds.value)
    for (const id of ids) next.delete(id)
    selectedIds.value = next
  }

  async function removeOne(id: string) {
    await deleteHistoryItem(id)
    dropLocally([id])
  }

  async function removeSelected(): Promise<number> {
    const ids = [...selectedIds.value]
    if (ids.length === 0) return 0
    const { deleted } = await deleteHistoryItems(ids)
    dropLocally(ids)
    return deleted
  }

  async function cleanup(input: CleanupInput) {
    const result = await cleanupHistory(input)
    await load({ silent: true })
    return result
  }

  return {
    items,
    loading,
    error,
    typeFilter,
    statusFilter,
    batchMode,
    selectedIds,
    selectedCount,
    filtered,
    stats,
    load,
    toggleBatchMode,
    toggleSelect,
    removeOne,
    removeSelected,
    cleanup,
  }
}
