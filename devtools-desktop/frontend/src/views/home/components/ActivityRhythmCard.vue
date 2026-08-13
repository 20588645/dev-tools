<script setup lang="ts">
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  total: number
  peak: string
  heights: number[]
  runCount: number
  deployCount: number
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="hcard activity-card" aria-labelledby="home-activity-title">
    <HomeCardHeader title="活动节奏" :hint="total ? `近 24h · ${peak}` : '近 24h'" title-id="home-activity-title" />
    <div class="hcard-body">
      <LoadingState v-if="loading" compact label="整理今日活动…" />
      <ErrorState v-else-if="error" compact title="活动记录暂不可用" :description="error" @retry="$emit('retry')" />
      <template v-else>
        <div class="act-bars" :aria-label="`今日 ${total} 次活动`">
          <i
            v-for="(height, index) in heights"
            :key="index"
            :class="{ dim: !total || height <= 6 }"
            :style="{ height: `${height}%` }"
          />
        </div>
        <div class="act-x" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        <div class="act-stats">
          <div class="act-stat"><b>{{ runCount }}</b><span>运行</span></div>
          <div class="act-stat"><b>{{ deployCount }}</b><span>部署</span></div>
          <div class="act-stat"><b>{{ total }}</b><span>合计</span></div>
        </div>
      </template>
    </div>
  </section>
</template>
