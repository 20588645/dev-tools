<script setup lang="ts">
import { onActivated, onDeactivated, ref } from 'vue'

import PageFrame from '@/components/layout/PageFrame.vue'
import { navigateToPage } from '@/router/navigate'

import ActivityRhythmCard from './components/ActivityRhythmCard.vue'
import AmbientPaletteCard from './components/AmbientPaletteCard.vue'
import ClockCard from './components/ClockCard.vue'
import DailyQuoteCard from './components/DailyQuoteCard.vue'
import DaylightCard from './components/DaylightCard.vue'
import IpPurityCard from './components/IpPurityCard.vue'
import UsageSummaryCard from './components/UsageSummaryCard.vue'
import WeeklyFootprintCard from './components/WeeklyFootprintCard.vue'
import YearProgressCard from './components/YearProgressCard.vue'
import { useHomeDashboard } from './composables/useHomeDashboard'
import './home.css'

defineOptions({ name: 'HomeView' })

/** KeepAlive：用 activated 驱动刷新，不再依赖 MigrationHost 传入的 active prop */
const active = ref(true)
onActivated(() => { active.value = true })
onDeactivated(() => { active.value = false })

const {
  dateLabel,
  greeting,
  quote,
  quoteSaved,
  savedCount,
  quoteSwitching,
  nextQuote,
  toggleQuoteSaved,
  usageState,
  todayTokens,
  todayCost,
  monthTokens,
  monthCost,
  usageWeekTrend,
  usageSplit,
  purity,
  purityState,
  purityCheckedAt,
  activityState,
  activityTotal,
  activityPeak,
  activityHeights,
  runCountToday,
  deployCountToday,
  daylight,
  yearProgress,
  weeklyFootprint,
  ambientPalette,
  refreshDashboard,
  refreshPurity,
} = useHomeDashboard(active)
</script>

<template>
  <PageFrame class="home-view" variant="immersive">
    <div class="home-grid">
      <DailyQuoteCard
        :date-label="dateLabel"
        :quote="quote"
        :saved="quoteSaved"
        :saved-count="savedCount"
        :switching="quoteSwitching"
        :greeting="greeting"
        :activity-total="activityTotal"
        @next="nextQuote"
        @toggle-saved="toggleQuoteSaved"
      />
      <UsageSummaryCard
        :loading="usageState.loading"
        :error="usageState.error"
        :month-tokens="monthTokens"
        :month-cost="monthCost"
        :today-tokens="todayTokens"
        :today-cost="todayCost"
        :week-trend="usageWeekTrend"
        :split="usageSplit"
        @open="navigateToPage('usage')"
        @retry="refreshDashboard"
      />
      <IpPurityCard
        :loading="purityState.loading"
        :error="purityState.error"
        :purity="purity"
        :checked-at="purityCheckedAt"
        @open="navigateToPage('ipcheck')"
        @retry="refreshPurity(true)"
      />
      <ClockCard />
      <DaylightCard :daylight="daylight" />
      <YearProgressCard :progress="yearProgress" />
      <ActivityRhythmCard
        :loading="activityState.loading"
        :error="activityState.error"
        :total="activityTotal"
        :peak="activityPeak"
        :heights="activityHeights"
        :run-count="runCountToday"
        :deploy-count="deployCountToday"
        @retry="refreshDashboard"
      />
      <WeeklyFootprintCard
        :loading="activityState.loading"
        :error="activityState.error"
        :footprint="weeklyFootprint"
        @open="navigateToPage('notes')"
        @retry="refreshDashboard"
      />
      <AmbientPaletteCard :palette="ambientPalette" />
    </div>
  </PageFrame>
</template>
