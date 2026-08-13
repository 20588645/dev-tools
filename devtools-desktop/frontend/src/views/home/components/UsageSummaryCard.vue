<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import AreaChart from '@/components/charts/AreaChart.vue'
import SplitBar from '@/components/charts/SplitBar.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import type { UsageWeekTrend } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  monthTokens: string
  monthCost: string
  todayTokens: string
  todayCost: string
  weekTrend: UsageWeekTrend
  split: { label: string; percent: number }[]
}>()

defineEmits<{
  open: []
  retry: []
}>()
</script>

<template>
  <section class="hcard usage-card" aria-labelledby="home-usage-title">
    <HomeCardHeader title="用量摘要" title-id="home-usage-title">
      <template #action>
        <BaseButton variant="outline" size="sm" @click="$emit('open')">明细</BaseButton>
      </template>
    </HomeCardHeader>
    <div class="hcard-body">
      <LoadingState v-if="loading" compact label="读取用量…" />
      <ErrorState v-else-if="error" compact title="用量暂不可用" :description="error" @retry="$emit('retry')" />
      <template v-else>
        <div class="usage-kpis">
          <div><div class="usage-value">{{ monthTokens }}</div><div class="usage-label">本月 Token · ≈ {{ monthCost }}</div></div>
          <div><div class="usage-value">{{ todayTokens }}</div><div class="usage-label">今日 Token · ≈ {{ todayCost }}</div></div>
        </div>
        <div class="usage-chart">
          <AreaChart
            v-if="weekTrend.hasData"
            :values="weekTrend.values"
            :labels="weekTrend.labels"
            :markers="weekTrend.markers"
            :height="72"
            aria-label="近 7 天 Token 用量趋势"
          />
          <div v-else class="usage-empty">近 7 天暂无用量记录</div>
        </div>
        <SplitBar v-if="split.length" :segments="split" aria-label="本月 Token 构成" />
      </template>
    </div>
  </section>
</template>
