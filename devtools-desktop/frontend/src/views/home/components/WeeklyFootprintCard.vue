<script setup lang="ts">
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import type { WeeklyFootprintData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  footprint: WeeklyFootprintData
}>()

defineEmits<{ retry: [] }>()

const labels = ['一', '二', '三', '四', '五', '六', '日']
</script>

<template>
  <section class="g-card week-card" aria-labelledby="home-week-title">
    <HomeCardHeader label="This Week" title="本周足迹" title-id="home-week-title" :hint="footprint.range" />
    <LoadingState v-if="loading" compact label="整理本周足迹…" />
    <ErrorState v-else-if="error" compact title="本周记录暂不可用" :description="error" @retry="$emit('retry')" />
    <template v-else>
      <div class="week-days">
        <span v-for="(label, index) in labels" :key="label" class="week-day" :class="{ active: footprint.currentDay === index }">
          <i :style="{ '--bar-height': `${footprint.heights[index]}%` }" />{{ label }}
        </span>
      </div>
      <div class="week-foot"><span>活跃日<b>{{ footprint.activeDays }} 天</b></span><span>平均<b>{{ footprint.average }} 次</b></span><span>峰值<b>{{ footprint.peak }}</b></span></div>
    </template>
  </section>
</template>
