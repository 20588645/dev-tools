<script setup lang="ts">
import { computed, h } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import EmptyState from '@/components/feedback/EmptyState.vue'
import type { UsageProjectStat } from '@/services/modules/usage-service'

import { formatUsageCost, formatUsageNumber, formatUsagePercent, usageAppLabel, usageAppTone, usageProjectTokens } from '../usage-format'

const props = defineProps<{ projects: UsageProjectStat[] }>()
const visible = computed(() => props.projects.slice(0, 6))
const max = computed(() => Math.max(...visible.value.map(usageProjectTokens), 1))
const total = computed(() => props.projects.reduce((sum, project) => sum + usageProjectTokens(project), 0) || 1)

type ProjectTableRow = UsageProjectStat & BaseDataTableRow & { rank: number }
const tableRows = computed<ProjectTableRow[]>(() => visible.value.map((project, index) => ({ ...project, rank: index + 1 })))

const columns = computed<BaseDataTableColumn<ProjectTableRow>[]>(() => [
  { key: 'rank', title: '排名', width: 54, align: 'right', render: row => h('span', { class: ['usage-rank', { 'is-top': row.rank <= 3 }] }, row.rank) },
  {
    key: 'project', title: '项目 / 应用', minWidth: 230,
    render: row => h('div', [
      h('div', { class: 'usage-project-name' }, [
        ...row.apps.map(app => h(BaseBadge, {
          key: app,
          class: ['usage-app-tag', `is-${usageAppTone(app)}`],
        }, () => usageAppLabel(app))),
        h('strong', row.project),
      ]),
      h('div', { class: 'usage-project-bar' }, [
        h('i', { style: { width: `${usageProjectTokens(row) / max.value * 100}%` } }),
      ]),
    ]),
  },
  { key: 'requests', title: '请求数', width: 82, align: 'right', render: row => formatUsageNumber(row.requests) },
  { key: 'tokens', title: 'Tokens', width: 104, align: 'right', render: row => formatUsageNumber(usageProjectTokens(row)) },
  { key: 'ratio', title: '占比', width: 76, align: 'right', render: row => formatUsagePercent(usageProjectTokens(row) / total.value) },
  {
    key: 'cost', title: '成本', width: 92, align: 'right',
    render: row => h('span', { class: 'usage-mono' }, row.costMicroUsd > 0 ? formatUsageCost(row.costMicroUsd) : '不可计算'),
  },
])
</script>

<template>
  <div class="usage-ranking">
    <div class="usage-section-heading"><h2>项目用量</h2></div>
    <EmptyState v-if="!visible.length" compact title="暂无项目用量" />
    <BaseDataTable
      v-else
      :columns="columns"
      :rows="tableRows"
      :row-key="row => row.project"
      density="compact"
      :scroll-x="720"
      aria-label="项目用量排名"
    />
  </div>
</template>
