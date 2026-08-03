<script setup lang="ts">
import { computed, h } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import EmptyState from '@/components/feedback/EmptyState.vue'
import type { UsageLogRecord } from '@/services/modules/usage-service'

import {
  formatUsageCost,
  formatUsageDate,
  formatUsageNumber,
  usageLogTokens,
  usageProjectName,
} from '../usage-format'

const props = defineProps<{
  rows: UsageLogRecord[]
  priced: boolean
}>()

type RequestTableRow = UsageLogRecord & BaseDataTableRow & { rank: number }
const tableRows = computed<RequestTableRow[]>(() => props.rows.slice(0, 6).map((row, index) => ({ ...row, rank: index + 1 })))
const columns = computed<BaseDataTableColumn<RequestTableRow>[]>(() => [
  { key: 'rank', title: '排名', width: 54, align: 'right', render: row => h('span', { class: ['usage-rank', { 'is-top': row.rank <= 3 }] }, row.rank) },
  { key: 'createdAt', title: '时间', width: 132, render: row => h('span', { class: 'usage-mono' }, formatUsageDate(row.createdAt)) },
  {
    key: 'project', title: '项目 / 应用', minWidth: 170,
    render: row => h('div', { class: 'usage-request-cell' }, [
      h('span', { class: 'usage-request-project' }, usageProjectName(row.projectDir)),
      h(BaseBadge, {
        class: ['usage-app-tag', row.appType === 'codex' ? 'is-codex' : 'is-claude'],
      }, () => row.appType === 'codex' ? 'Codex' : 'Claude'),
    ]),
  },
  { key: 'model', title: '模型', minWidth: 150, render: row => h('span', { class: 'usage-mono' }, row.model) },
  {
    key: 'value', title: props.priced ? '成本' : 'Tokens', width: 104, align: 'right',
    render: row => h('span', { class: 'usage-mono' }, props.priced ? formatUsageCost(row.costMicroUsd) : formatUsageNumber(usageLogTokens(row))),
  },
])
</script>

<template>
  <div class="usage-requests">
    <div class="usage-section-heading">
      <h2>{{ priced ? '最贵请求' : '最大 Token 请求' }}</h2>
      <span>{{ priced ? '按当前单价排序' : '单价不足时按 Token 峰值排序' }}</span>
    </div>
    <EmptyState v-if="!rows.length" compact title="暂无请求记录" />
    <BaseDataTable
      v-else
      :columns="columns"
      :rows="tableRows"
      :row-key="row => row.requestId"
      density="compact"
      :scroll-x="650"
      aria-label="高用量请求排名"
    />
  </div>
</template>
