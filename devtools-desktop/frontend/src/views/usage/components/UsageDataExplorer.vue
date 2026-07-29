<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
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
  usageModelTokens,
  usageProjectName,
} from '../usage-format'

defineProps<{
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
      <EmptyState v-if="!models.length" compact title="暂无模型统计" />
      <div v-else class="usage-table-wrap">
        <table class="usage-table">
          <thead><tr><th>模型</th><th>应用</th><th>请求数</th><th>Tokens</th><th>缓存输入占比</th><th>单价状态</th></tr></thead>
          <tbody>
            <tr v-for="model in models" :key="`${model.model}-${model.appType}`">
              <td>
                <strong>{{ model.displayName || model.model }}</strong>
                <span v-if="model.displayName && model.displayName !== model.model" class="usage-model-id">{{ model.model }}</span>
              </td>
              <td>
                <BaseBadge
                  class="usage-app-tag"
                  :class="model.appType === 'codex' ? 'is-codex' : 'is-claude'"
                >{{ model.appType === 'codex' ? 'Codex' : 'Claude' }}</BaseBadge>
              </td>
              <td>{{ formatUsageNumber(model.requests) }}</td>
              <td>{{ formatUsageNumber(usageModelTokens(model)) }}</td>
              <td>{{ formatUsagePercent(model.cacheReadTokens / Math.max(1, model.inputTokens + model.cacheReadTokens + model.cacheCreationTokens)) }}</td>
              <td><BaseBadge :tone="model.pricingModel ? 'success' : 'warning'">{{ model.pricingModel ? '已定价' : '未匹配' }}</BaseBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'logs'" class="usage-explorer__body">
      <div class="usage-explorer__filters">
        <!-- logModel 为空时 BaseSelect 显示 placeholder，需给出「全部模型」而非默认「请选择」 -->
        <BaseSelect
          :model-value="logModel"
          :options="modelOptions"
          placeholder="全部模型"
          aria-label="请求日志模型筛选"
          @update:model-value="emit('update:log-model', $event)"
        />
      </div>
      <EmptyState v-if="!logs.rows.length" compact title="暂无请求日志" />
      <template v-else>
        <div class="usage-table-wrap">
          <table class="usage-table">
            <thead><tr><th>时间</th><th>模型</th><th>项目</th><th>新增输入</th><th>输出</th><th>缓存命中</th><th>成本状态</th></tr></thead>
            <tbody>
              <tr v-for="row in logs.rows" :key="row.requestId">
                <td class="usage-mono">{{ formatUsageDate(row.createdAt) }}</td>
                <td class="usage-mono">{{ row.model }}</td>
                <td>{{ usageProjectName(row.projectDir) }}</td>
                <td>{{ formatUsageNumber(row.inputTokens) }}</td>
                <td>{{ formatUsageNumber(row.outputTokens) }}</td>
                <td>{{ formatUsageNumber(row.cacheReadTokens) }}</td>
                <td>{{ row.pricingModel ? formatUsageCost(row.costMicroUsd) : '不可计算' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
