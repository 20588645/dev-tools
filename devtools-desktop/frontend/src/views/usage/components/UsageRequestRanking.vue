<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import type { UsageLogRecord } from '@/services/modules/usage-service'

import {
  formatUsageCost,
  formatUsageDate,
  formatUsageNumber,
  usageLogTokens,
  usageProjectName,
} from '../usage-format'

defineProps<{
  rows: UsageLogRecord[]
  priced: boolean
}>()
</script>

<template>
  <div class="usage-requests">
    <div class="usage-section-heading">
      <h2>{{ priced ? '最贵请求' : '最大 Token 请求' }}</h2>
      <span>{{ priced ? '按当前单价排序' : '单价不足时按 Token 峰值排序' }}</span>
    </div>
    <EmptyState v-if="!rows.length" compact title="暂无请求记录" />
    <div v-else class="usage-table-wrap">
      <table class="usage-table">
        <thead><tr><th>排名</th><th>时间</th><th>项目 / 应用</th><th>模型</th><th>{{ priced ? '成本' : 'Tokens' }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows.slice(0, 6)" :key="row.requestId">
            <td><span class="usage-rank">{{ index + 1 }}</span></td>
            <td class="usage-mono">{{ formatUsageDate(row.createdAt) }}</td>
            <td>
              <span class="usage-request-project">{{ usageProjectName(row.projectDir) }}</span>
              <BaseBadge
                class="usage-app-tag"
                :class="row.appType === 'codex' ? 'is-codex' : 'is-claude'"
              >{{ row.appType === 'codex' ? 'Codex' : 'Claude' }}</BaseBadge>
            </td>
            <td class="usage-mono">{{ row.model }}</td>
            <td class="usage-mono">{{ priced ? formatUsageCost(row.costMicroUsd) : formatUsageNumber(usageLogTokens(row)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
