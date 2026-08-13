<script setup lang="ts">
import type { YearProgressData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ progress: YearProgressData }>()
</script>

<template>
  <section class="hcard year-card" aria-labelledby="home-year-title">
    <HomeCardHeader title="年度进度" :hint="String(progress.year)" title-id="home-year-title" />
    <div class="hcard-body">
      <div class="year-top">
        <span class="year-value">{{ progress.percent.toFixed(0) }}%</span>
        <span class="year-sub">已过去 {{ progress.dayIndex }} 天 · 剩 {{ progress.remaining }} 天</span>
      </div>
      <div class="year-cells" aria-hidden="true">
        <i
          v-for="month in 12"
          :key="month"
          :class="{ past: month - 1 < progress.monthIndex, now: month - 1 === progress.monthIndex }"
        />
      </div>
      <div class="year-rows">
        <div class="year-row"><span>本周</span><b>第 {{ progress.weekNumber }} 周</b></div>
        <div class="year-row"><span>本季度剩余</span><b>{{ progress.quarterRemaining }} 天</b></div>
        <div class="year-row"><span>距离元旦</span><b>{{ progress.remaining }} 天</b></div>
      </div>
    </div>
  </section>
</template>
