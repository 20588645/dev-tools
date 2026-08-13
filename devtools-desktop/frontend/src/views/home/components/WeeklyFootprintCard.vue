<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import type { WeeklyFootprintData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  footprint: WeeklyFootprintData
}>()

defineEmits<{ open: []; retry: [] }>()

const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
</script>

<template>
  <section class="hcard week-card" aria-labelledby="home-week-title">
    <HomeCardHeader
      title="每周足迹"
      :hint="`本周 ${footprint.total} 次 · 活跃 ${footprint.activeDays} 天 · ${footprint.range}`"
      title-id="home-week-title"
    >
      <template #action>
        <BaseButton variant="outline" size="sm" @click="$emit('open')">工时内容</BaseButton>
      </template>
    </HomeCardHeader>
    <div class="hcard-body">
      <LoadingState v-if="loading" compact label="整理本周足迹…" />
      <ErrorState v-else-if="error" compact title="本周记录暂不可用" :description="error" @retry="$emit('retry')" />
      <div v-else class="week-chart" :aria-label="`本周共 ${footprint.total} 次活动，峰值 ${footprint.peak}`">
        <div
          v-for="(label, index) in labels"
          :key="label"
          class="week-col"
          :class="{ hot: footprint.counts[index] > 0 && footprint.heights[index] >= 66, today: footprint.currentDay === index }"
        >
          <div class="week-value">{{ footprint.counts[index] }} 次</div>
          <div class="week-track"><i :style="{ height: `${footprint.heights[index]}%` }" /></div>
          <div class="week-day">{{ label }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
