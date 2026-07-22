<script setup lang="ts">
import type { YearProgressData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ progress: YearProgressData }>()
</script>

<template>
  <section class="g-card year-card" aria-labelledby="home-year-title">
    <HomeCardHeader label="Year" title="年度进度" title-id="home-year-title" :hint="String(progress.year)" />
    <div class="year-main"><strong>{{ progress.dayIndex }}</strong><span>/ {{ progress.totalDays }}</span></div>
    <div class="year-track" aria-hidden="true"><i :style="{ width: `${progress.percent}%` }" /></div>
    <div class="year-meta"><span>{{ progress.percent.toFixed(1) }}%</span><span>剩余 {{ progress.remaining }} 天</span></div>
  </section>
</template>
