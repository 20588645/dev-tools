<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  tokens: string
  delta: string
  cost: string
  cacheRate: string
  requests: string
  heights: number[]
  hasTrend: boolean
}>()

defineEmits<{
  open: []
  retry: []
}>()
</script>

<template>
  <section class="g-card home-usage-card" aria-labelledby="home-usage-title">
    <div class="usage-copy">
      <HomeCardHeader label="Today · Usage" title="用量统计" title-id="home-usage-title">
        <template #action>
          <BaseButton class="g-card-action" variant="ghost" size="sm" @click="$emit('open')">查看详情 →</BaseButton>
        </template>
      </HomeCardHeader>
      <LoadingState v-if="loading" compact label="读取今日用量…" />
      <ErrorState v-else-if="error" compact title="用量暂不可用" :description="error" @retry="$emit('retry')" />
      <template v-else>
        <div class="usage-number"><strong>{{ tokens }}</strong><span>Tokens</span></div>
        <div class="home-usage-delta">{{ delta }}</div>
        <div class="usage-metrics">
          <span>成本<strong>{{ cost }}</strong></span>
          <span>缓存命中<strong>{{ cacheRate }}</strong></span>
          <span>请求<strong>{{ requests }}</strong></span>
        </div>
      </template>
    </div>
    <div class="usage-chart" :class="{ empty: !hasTrend }">
      <div class="chart-caption"><span>00:00</span><span>{{ hasTrend ? '今日真实分时趋势' : '暂无分时数据' }}</span><span>NOW</span></div>
      <div class="spark-bars" :aria-label="hasTrend ? '今日真实用量趋势' : '今日暂无分时用量数据'">
        <i v-for="(height, index) in heights" :key="index" :style="{ '--bar-height': `${height}%`, '--bar-opacity': hasTrend ? String(.35 + height / 155) : '.16' }" />
      </div>
    </div>
  </section>
</template>
