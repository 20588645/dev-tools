<script setup lang="ts">
import { computed, h } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import EmptyState from '@/components/feedback/EmptyState.vue'
import BaseSelect, { type SelectOption } from '@/components/form/BaseSelect.vue'
import BaseTabs from '@/components/navigation/BaseTabs.vue'
import type {
  UsageLogsPage,
  UsageModelStat,
} from '@/services/modules/usage-service'

import type { UsageExplorerTab } from '../composables/useUsage'
import {
  formatUsageCost,
  formatUsageDate,
  formatUsageNumber,
  formatUsagePercent,
  usageAppLabel,
  usageAppTone,
  usageModelTokens,
  usageProjectName,
} from '../usage-format'

const props = defineProps<{
  activeTab: UsageExplorerTab
  models: UsageModelStat[]
  logs: UsageLogsPage
  logModel: string
  modelOptions: SelectOption[]
  priced: boolean
}>()

const emit = defineEmits<{
  'update:active-tab': [value: UsageExplorerTab]
  'update:log-model': [value: string]
  page: [value: number]
  'open-settings': []
}>()

const tabs = [
  { label: '模型', value: 'models' },
  { label: '请求日志', value: 'logs' },
  { label: '价格设置', value: 'pricing' },
]

type ModelTableRow = UsageModelStat & BaseDataTableRow
type LogTableRow = UsageLogsPage['rows'][number] & BaseDataTableRow

const modelRows = computed<ModelTableRow[]>(() => props.models.map((row) => ({ ...row })))
const logRows = computed<LogTableRow[]>(() => props.logs.rows.map((row) => ({ ...row })))

const modelColumns: BaseDataTableColumn<ModelTableRow>[] = [
  {
    key: 'model', title: '模型', minWidth: 180,
    render: model => h('div', [
      h('strong', model.displayName || model.model),
      model.displayName && model.displayName !== model.model
        ? h('span', { class: 'usage-model-id' }, model.model)
        : null,
    ]),
  },
  {
    key: 'appType', title: '应用', width: 92,
    render: model => h(BaseBadge, {
      class: ['usage-app-tag', `is-${usageAppTone(model.appType)}`],
    }, () => usageAppLabel(model.appType)),
  },
  { key: 'requests', title: '请求数', width: 90, align: 'right', render: model => formatUsageNumber(model.requests) },
  { key: 'tokens', title: 'Tokens', width: 110, align: 'right', render: model => formatUsageNumber(usageModelTokens(model)) },
  {
    key: 'cacheRatio', title: '缓存输入占比', width: 120, align: 'right',
    render: model => formatUsagePercent(model.cacheReadTokens / Math.max(1, model.inputTokens + model.cacheReadTokens + model.cacheCreationTokens)),
  },
  {
    key: 'pricingModel', title: '单价状态', width: 92,
    render: model => h(BaseBadge, { tone: model.pricingModel ? 'success' : 'warning' }, () => model.pricingModel ? '已定价' : '未匹配'),
  },
  {
    key: 'cost', title: '成本', width: 96, align: 'right',
    render: model => h('span', { class: 'usage-mono' }, model.costMicroUsd > 0 ? formatUsageCost(model.costMicroUsd) : '不可计算'),
  },
]

const logColumns: BaseDataTableColumn<LogTableRow>[] = [
  { key: 'createdAt', title: '时间', width: 136, render: row => h('span', { class: 'usage-mono' }, formatUsageDate(row.createdAt)) },
  { key: 'model', title: '模型', minWidth: 150, render: row => h('span', { class: 'usage-mono' }, row.model) },
  { key: 'projectDir', title: '项目', minWidth: 120, render: row => usageProjectName(row.projectDir) },
  { key: 'inputTokens', title: '新增输入', width: 92, align: 'right', render: row => formatUsageNumber(row.inputTokens) },
  { key: 'outputTokens', title: '输出', width: 82, align: 'right', render: row => formatUsageNumber(row.outputTokens) },
  { key: 'cacheReadTokens', title: '缓存命中', width: 96, align: 'right', render: row => formatUsageNumber(row.cacheReadTokens) },
  { key: 'cost', title: '成本状态', width: 96, align: 'right', render: row => row.pricingModel ? formatUsageCost(row.costMicroUsd) : '不可计算' },
]
</script>

<template>
  <section class="usage-explorer" aria-labelledby="usage-explorer-title">
    <div class="usage-explorer__header">
      <h2 id="usage-explorer-title">数据探索</h2>
      <BaseTabs
        :model-value="activeTab"
        :items="tabs"
        aria-label="用量数据探索"
        @update:model-value="emit('update:active-tab', $event as UsageExplorerTab)"
      />
    </div>

    <div v-if="activeTab === 'models'" class="usage-explorer__body">
      <BaseDataTable
        :columns="modelColumns"
        :rows="modelRows"
        :row-key="row => `${row.model}-${row.appType}`"
        density="compact"
        :scroll-x="860"
        aria-label="模型用量统计"
        empty-text="暂无模型统计"
      />
    </div>

    <div v-else-if="activeTab === 'logs'" class="usage-explorer__body">
      <div class="usage-explorer__filters">
        <!-- logModel 为空时 BaseSelect 显示 placeholder，需给出「全部模型」而非默认「请选择」 -->
        <BaseSelect
          size="sm"
          :model-value="logModel"
          :options="modelOptions"
          class="usage-explorer__model-select"
          placeholder="全部模型"
          aria-label="请求日志模型筛选"
          @update:model-value="emit('update:log-model', $event)"
        />
      </div>
      <template v-if="logs.rows.length">
        <BaseDataTable
          :columns="logColumns"
          :rows="logRows"
          :row-key="row => row.requestId"
          density="compact"
          :scroll-x="872"
          aria-label="用量请求日志"
        />
        <div class="usage-pager">
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="logs.page <= 1"
            @click="emit('page', logs.page - 1)"
          >上一页</BaseButton>
          <span>第 {{ logs.page }} / {{ Math.max(1, Math.ceil(logs.total / logs.pageSize)) }} 页 · 共 {{ formatUsageNumber(logs.total) }} 条</span>
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="logs.page * logs.pageSize >= logs.total"
            @click="emit('page', logs.page + 1)"
          >下一页</BaseButton>
        </div>
      </template>
      <EmptyState v-else compact title="暂无请求日志" />
    </div>

    <div v-else class="usage-explorer__body usage-explorer__pricing">
      <div>
        <strong>在线价格同步</strong>
        <span>可靠匹配后直接覆盖本地单价；未匹配模型保留原值。</span>
      </div>
      <div>
        <strong>当前成本状态</strong>
        <span>{{ priced ? '存在已定价用量，可以计算部分成本。' : '当前筛选范围尚无可计算成本。' }}</span>
      </div>
      <BaseButton variant="secondary" @click="emit('open-settings')">打开数据与价格设置</BaseButton>
    </div>
  </section>
</template>
