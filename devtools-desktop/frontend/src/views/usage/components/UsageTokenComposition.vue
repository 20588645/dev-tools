<script setup lang="ts">
import { computed } from 'vue'

import type { UsageSummary } from '@/services/modules/usage-service'

import { formatUsageNumber, formatUsagePercent } from '../usage-format'

const props = defineProps<{ summary: UsageSummary }>()

const items = computed(() => {
  const total = props.summary.totalTokens || 1
  return [
    { key: 'input', label: '新增输入', value: props.summary.inputTokens, tone: 'action' },
    { key: 'output', label: '输出', value: props.summary.outputTokens, tone: 'info' },
    { key: 'cache', label: '缓存命中（输入）', value: props.summary.cacheReadTokens, tone: 'success' },
    { key: 'creation', label: '缓存创建', value: props.summary.cacheCreationTokens, tone: 'muted' },
  ].map((item) => ({ ...item, ratio: item.value / total }))
})
</script>

<template>
  <div class="usage-composition">
    <div class="usage-section-heading">
      <h2>Token 构成</h2>
      <span>{{ formatUsageNumber(summary.totalTokens) }}</span>
    </div>
    <div class="usage-composition__bar" aria-label="Token 构成">
      <i
        v-for="item in items"
        :key="item.key"
        :class="`is-${item.tone}`"
        :style="{ width: `${item.ratio * 100}%` }"
      />
    </div>
    <div class="usage-composition__legend">
      <div v-for="item in items" :key="item.key" :class="`is-${item.tone}`">
        <span>{{ item.label }}</span>
        <strong>{{ formatUsageNumber(item.value) }}（{{ formatUsagePercent(item.ratio) }}）</strong>
      </div>
    </div>
  </div>
</template>
