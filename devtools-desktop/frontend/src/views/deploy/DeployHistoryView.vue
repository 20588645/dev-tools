<script setup lang="ts">
import { computed, h, onActivated, onMounted, ref } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import { getHistoryLog, type HistoryItem } from '@/services/modules/deploy-service'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'

import HistoryCleanupDialog from './components/HistoryCleanupDialog.vue'
import DeployChrome from './components/DeployChrome.vue'
import HistoryRowActions from './components/HistoryRowActions.vue'
import {
  useDeployHistory,
  type HistoryStatusFilter,
  type HistoryTypeFilter,
} from './composables/useDeployHistory'
import { formatDeployTime } from './deploy-format'
import './deploy-history.css'

defineOptions({ name: 'DeployHistoryView' })

const page = useDeployHistory()
const log = useLogTaskStore()
const notify = useNotificationStore()

const pendingRemove = ref<HistoryItem | null>(null)
const confirmBatch = ref(false)
const cleanupOpen = ref(false)
const cleanupRunning = ref(false)
const keepDays = ref('30')
const keepPerProject = ref('5')

const reason = (cause: unknown) => cause instanceof Error ? cause.message : '未知错误'

const TYPE_FILTERS: SegmentOption[] = [
  { label: '全部类型', value: 'all' },
  { label: '部署', value: 'deploy' },
  { label: '构建', value: 'build-only' },
]

/** 原型 .seg：状态筛选标签随统计带数量（全部 128 / 成功 119 / 失败 6），取代独立摘要条。 */
const statusOptions = computed<SegmentOption[]>(() => {
  const stats = page.stats.value
  return [
    { label: `全部 ${stats.total}`, value: 'all' },
    { label: `成功 ${stats.success}`, value: 'success' },
    { label: `失败 ${stats.failed}`, value: 'error' },
  ]
})

/** 模块标签只列前 3 个，其余折进 +N（修 H1，与本地运行页、项目总览一致）。 */
const MODULE_TAG_LIMIT = 3

type HistoryRow = HistoryItem & BaseDataTableRow

const rows = computed<HistoryRow[]>(() => page.filtered.value.map(item => ({ ...item })))

const allSelected = computed(() => (
  rows.value.length > 0 && rows.value.every(row => page.selectedIds.value.has(row.id))
))

function toggleAll(select: boolean) {
  for (const row of rows.value) {
    const has = page.selectedIds.value.has(row.id)
    if (select !== has) page.toggleSelect(row.id)
  }
}

const columns = computed<BaseDataTableColumn<HistoryRow>[]>(() => {
  const checkColumn: BaseDataTableColumn<HistoryRow>[] = page.batchMode.value
    ? [{
        key: 'check',
        title: '',
        width: 44,
        render: row => h(BaseCheckbox, {
          modelValue: page.selectedIds.value.has(row.id),
          label: `选择 ${row.projectName} 的记录`,
          labelVisible: false,
          'onUpdate:modelValue': () => page.toggleSelect(row.id),
        }),
      }]
    : []

  return [
    ...checkColumn,
    {
      key: 'timestamp', title: '时间', width: 108,
      render: row => h('span', { class: 'deploy-history__time' }, formatDeployTime(row.timestamp)),
    },
    { key: 'projectName', title: '项目', minWidth: 150, ellipsis: true },
    {
      key: 'type', title: '类型', width: 84,
      render: row => h(BaseBadge, null, () => row.type === 'deploy' ? '部署' : '构建'),
    },
    {
      key: 'modules', title: '模块', minWidth: 170,
      render: (row) => {
        if (row.modules.length === 0) return h('span', { class: 'deploy-history__muted' }, '—')
        const visible = row.modules.slice(0, MODULE_TAG_LIMIT)
        const hidden = row.modules.length - visible.length
        return h('span', { class: 'deploy-history__mods' }, [
          ...visible.map(name => h('span', { key: name, class: 'deploy-history__mod' }, name)),
          hidden > 0 ? h('span', { class: 'deploy-history__mods-more' }, `+${hidden}`) : null,
        ])
      },
    },
    {
      key: 'serverName', title: '服务器', minWidth: 140, ellipsis: true,
      render: row => row.serverName
        ? h('span', { class: 'deploy-history__server' }, row.serverName)
        : h('span', { class: 'deploy-history__muted' }, '—'),
    },
    {
      key: 'status', title: '状态', width: 104,
      render: row => h(StatusIndicator, {
        status: row.status === 'success' ? 'online' : 'offline',
        label: row.status === 'success' ? row.duration || '成功' : '失败',
      }),
    },
    {
      // 固定宽度且不参与收缩，修 H2（极端长文本下操作列被挤出可视区）
      key: 'actions', title: '操作', width: 96, align: 'right', fixed: 'right',
      render: row => h(HistoryRowActions, {
        label: row.projectName,
        onView: () => void onViewLog(row),
        onRemove: () => { pendingRemove.value = row },
      }),
    },
  ]
})

async function refresh(options: { silent?: boolean } = {}) {
  try {
    await page.load(options)
  } catch (cause) {
    notify.push(`刷新历史失败：${reason(cause)}`, 'error')
  }
}

/** 历史回放：任务早已结束，running: false 让关闭键是「关闭」而非「最小化」。 */
async function onViewLog(row: HistoryItem) {
  const ok = row.status === 'success'
  log.open({
    kind: 'deploy',
    id: row.id,
    projectName: row.projectName,
    title: '部署日志',
    subtitle: `${row.projectName}${row.modules.length ? ` · ${row.modules.join(', ')}` : ''}`,
  }, { running: false })
  log.setProgress({ percent: 100, label: '100%', tone: ok ? 'success' : 'danger' })
  log.setResult({
    icon: ok ? '✅' : '❌',
    text: ok ? `部署完成！耗时 ${row.duration}` : '部署失败',
  })
  try {
    const lines = await getHistoryLog(row.id)
    log.replaceLines(lines.map(line => ({ text: line.text, type: line.type as never })))
  } catch (cause) {
    log.append(`加载日志失败: ${reason(cause)}`, 'error')
  }
}

async function onConfirmRemove() {
  const row = pendingRemove.value
  if (!row) return
  try {
    await page.removeOne(row.id)
    pendingRemove.value = null
    notify.push('已删除 1 条记录', 'success')
  } catch (cause) {
    notify.push(`删除失败：${reason(cause)}`, 'error')
  }
}

async function onConfirmBatch() {
  try {
    const deleted = await page.removeSelected()
    confirmBatch.value = false
    notify.push(`已移除 ${deleted} 条记录`, 'success')
  } catch (cause) {
    notify.push(`批量删除失败：${reason(cause)}`, 'error')
  }
}

async function onCleanup() {
  cleanupRunning.value = true
  try {
    // 后端已把入参钳制到 1～3650 / 1～1000，这里只做数字兜底
    const result = await page.cleanup({
      keepDays: Number(keepDays.value) || 30,
      keepPerProject: Number(keepPerProject.value) || 5,
    })
    cleanupOpen.value = false
    notify.push(`整理完成：清理 ${result.deleted} 条，剩余 ${result.after} 条`, 'success')
  } catch (cause) {
    notify.push(`整理失败：${reason(cause)}`, 'error')
  } finally {
    cleanupRunning.value = false
  }
}

onMounted(() => { void refresh() })
/** KeepAlive 缓存下重进子页不会再走 onMounted；别处产生的新记录要跟上。 */
onActivated(() => { void refresh({ silent: true }) })
</script>

<template>
  <DeployChrome>
  <div class="deploy-history" data-test="deploy-history">
    <div class="deploy-history__toolbar">
      <BaseButton
        :variant="page.batchMode.value ? 'primary' : 'secondary'"
        @click="page.toggleBatchMode()"
      >
        {{ page.batchMode.value ? '取消选择' : '选择' }}
      </BaseButton>
      <template v-if="page.batchMode.value">
        <BaseButton
          variant="danger"
          :disabled="page.selectedCount.value === 0"
          @click="confirmBatch = true"
        >
          删除 {{ page.selectedCount.value }}
        </BaseButton>
        <BaseCheckbox
          :model-value="allSelected"
          label="全选当前筛选结果"
          @update:model-value="toggleAll"
        />
      </template>
      <BaseButton variant="secondary" @click="cleanupOpen = true">整理</BaseButton>
    </div>

    <div class="deploy-history__filters">
      <BaseSegmented
        :model-value="page.typeFilter.value"
        :options="TYPE_FILTERS"
        aria-label="按类型筛选"
        @update:model-value="page.typeFilter.value = ($event as HistoryTypeFilter)"
      />
      <BaseSegmented
        :model-value="page.statusFilter.value"
        :options="statusOptions"
        aria-label="按状态筛选"
        @update:model-value="page.statusFilter.value = ($event as HistoryStatusFilter)"
      />
    </div>

    <LoadingState v-if="page.loading.value" label="正在加载部署历史…" />
    <ErrorState
      v-else-if="page.error.value"
      title="加载历史失败"
      :description="page.error.value"
      @retry="refresh()"
    />
    <template v-else>
      <EmptyState
        v-if="page.items.value.length === 0"
        title="还没有部署记录"
        description="执行一次构建或部署后，记录会出现在这里"
      />
      <EmptyState v-else-if="rows.length === 0" title="没有匹配的部署记录" compact />
      <BaseDataTable
        v-else
        :columns="columns"
        :rows="rows"
        :row-key="row => row.id"
        density="compact"
        :scroll-x="900"
        aria-label="部署历史"
      />
    </template>

    <ConfirmDialog
      :model-value="pendingRemove !== null"
      title="删除记录"
      :message="pendingRemove ? `确认删除「${pendingRemove.projectName}」这条记录？对应的日志文件会一并删除，不可恢复。` : ''"
      confirm-text="删除"
      tone="danger"
      @update:model-value="!$event && (pendingRemove = null)"
      @confirm="onConfirmRemove"
    />
    <ConfirmDialog
      v-model="confirmBatch"
      title="批量删除记录"
      :message="`确认删除选中的 ${page.selectedCount.value} 条记录？对应的日志文件会一并删除，此操作不可撤销。`"
      confirm-text="全部删除"
      tone="danger"
      @confirm="onConfirmBatch"
    />
    <HistoryCleanupDialog
      :open="cleanupOpen"
      :keep-days="keepDays"
      :keep-per-project="keepPerProject"
      :running="cleanupRunning"
      @update:open="cleanupOpen = $event"
      @update:keep-days="keepDays = $event"
      @update:keep-per-project="keepPerProject = $event"
      @submit="onCleanup"
    />
  </div>
  </DeployChrome>
</template>
