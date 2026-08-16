<script setup lang="ts">
import { h, ref, watch } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import {
  clearRunHistory,
  deleteRunHistoryItem,
  getRunHistory,
  type RunHistoryItem,
} from '@/services/modules/run-service'

import { formatHistoryStatus, formatHistoryTime } from '../run-format'

defineOptions({ name: 'RunHistoryDialog' })

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const items = ref<RunHistoryItem[]>([])
const loading = ref(false)
const error = ref('')
const pendingDelete = ref<RunHistoryItem | null>(null)
const confirmClear = ref(false)

type HistoryTableRow = RunHistoryItem & BaseDataTableRow

const columns: BaseDataTableColumn<HistoryTableRow>[] = [
  {
    key: 'startedAt', title: '时间', width: 130,
    render: row => h('span', { class: 'run-history__time' }, formatHistoryTime(row.startedAt)),
  },
  {
    key: 'projectName', title: '项目', minWidth: 150,
    render: row => h('span', { class: 'run-history__ellipsis', title: row.projectName }, row.projectName),
  },
  {
    key: 'modules', title: '模块', minWidth: 170,
    render: row => {
      const modules = row.modules.length > 0 ? row.modules.join(', ') : '—'
      return h('span', { class: 'run-history__ellipsis', title: modules }, modules)
    },
  },
  {
    key: 'status', title: '状态', width: 96,
    render: row => {
      const status = formatHistoryStatus(row.status)
      return h(BaseBadge, { tone: status.tone === 'neutral' ? 'neutral' : status.tone }, () => status.label)
    },
  },
  { key: 'duration', title: '运行时长', width: 100, render: row => row.duration || '—' },
  {
    key: 'actions', title: '操作', width: 66, align: 'center', fixed: 'right',
    render: row => h(BaseIconButton, {
      label: '删除这条记录',
      variant: 'danger',
      size: 'sm',
      onClick: () => { pendingDelete.value = row },
    }, () => '⌫'),
  },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await getRunHistory()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 每次打开都重新拉取，并先清空旧内容——否则二次打开会闪现上一次的数据
watch(() => props.open, (open) => {
  if (!open) return
  items.value = []
  void load()
})

async function removeItem() {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  try {
    await deleteRunHistoryItem(target.id)
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '删除失败'
  }
}

async function clearAll() {
  confirmClear.value = false
  try {
    await clearRunHistory()
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '清空失败'
  }
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="📋 本地运行历史"
    subtitle="最近 100 条运行记录"
    @update:model-value="!$event && emit('close')"
  >
    <LoadingState v-if="loading" title="加载中…" />
    <ErrorState v-else-if="error" title="加载失败" :description="error">
      <template #actions>
        <BaseButton variant="secondary" @click="load()">重试</BaseButton>
      </template>
    </ErrorState>
    <EmptyState v-else-if="items.length === 0" title="暂无运行历史记录" compact />

    <!-- F1/F2：字段与三档状态语义保持不变，只把正式业务表格交给公共组件。 -->
    <BaseDataTable
      v-else
      :columns="columns"
      :rows="items"
      :row-key="row => row.id"
      density="compact"
      bordered
      :max-height="420"
      :scroll-x="760"
      aria-label="本地运行历史"
    />

    <template #footer>
      <BaseButton
        variant="danger"
        :disabled="items.length === 0"
        @click="confirmClear = true"
      >🗑 清空历史</BaseButton>
      <BaseButton variant="ghost" @click="emit('close')">关闭</BaseButton>
    </template>
  </BaseDialog>

  <!-- 删除不可逆、按钮又是小图标易误触，与「清空历史」确认粒度对齐 -->
  <ConfirmDialog
    :model-value="pendingDelete !== null"
    title="删除运行记录"
    :message="pendingDelete ? `确定删除 ${pendingDelete.projectName} 的这条运行记录？` : ''"
    confirm-text="删除"
    tone="danger"
    @update:model-value="!$event && (pendingDelete = null)"
    @confirm="removeItem"
  />
  <ConfirmDialog
    v-model="confirmClear"
    title="清空运行历史"
    message="确定清空所有运行历史记录？此操作不可撤销。"
    confirm-text="清空"
    tone="danger"
    @confirm="clearAll"
  />
</template>

<style scoped>
.run-history__time {
  color: var(--color-text);
  font-family: var(--font-family-mono);
}

/* 长项目名/长模块串截断，避免撑宽弹窗（全名见 title 悬浮） */
.run-history__ellipsis {
  display: block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
