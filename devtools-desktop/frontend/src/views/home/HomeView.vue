<script setup lang="ts">
import { toRef } from 'vue'

import PageFrame from '@/components/layout/PageFrame.vue'
import { requestLegacyPage } from '@/legacy/legacy-bridge'

import ActivityRhythmCard from './components/ActivityRhythmCard.vue'
import AmbientPaletteCard from './components/AmbientPaletteCard.vue'
import DailyQuoteCard from './components/DailyQuoteCard.vue'
import DaylightCard from './components/DaylightCard.vue'
import IpPurityCard from './components/IpPurityCard.vue'
import MoonPhaseCard from './components/MoonPhaseCard.vue'
import TodayOverviewCard from './components/TodayOverviewCard.vue'
import UsageSummaryCard from './components/UsageSummaryCard.vue'
import WeeklyFootprintCard from './components/WeeklyFootprintCard.vue'
import YearProgressCard from './components/YearProgressCard.vue'
import { useHomeDashboard } from './composables/useHomeDashboard'
import './home.css'

defineOptions({ name: 'HomeView' })

const props = defineProps<{ active: boolean }>()

const {
  dateLabel,
  clockLabel,
  weather,
  quote,
  quoteIndex,
  quoteSaved,
  quoteSwitching,
  nextQuote,
  toggleQuoteSaved,
  usageState,
  usageTokens,
  usageCost,
  usageCacheRate,
  usageRequests,
  usageDelta,
  usageHeights,
  usageHasTrend,
  purity,
  purityState,
  activityState,
  activityTotal,
  activityPeak,
  activityHeights,
  daylight,
  yearProgress,
  weeklyFootprint,
  ambientMessage,
  ambientWave,
  moon,
  refreshDashboard,
  refreshPurity,
} = useHomeDashboard(toRef(props, 'active'))
</script>

<template>
  <PageFrame class="home-view" variant="immersive">
    <div class="home-gallery-grid">
      <DailyQuoteCard
        :date-label="dateLabel"
        :quote="quote"
        :quote-index="quoteIndex"
        :saved="quoteSaved"
        :switching="quoteSwitching"
        @next="nextQuote"
        @toggle-saved="toggleQuoteSaved"
      />
      <TodayOverviewCard :clock-label="clockLabel" :weather="weather" />
      <UsageSummaryCard
        :loading="usageState.loading"
        :error="usageState.error"
        :tokens="usageTokens"
        :delta="usageDelta"
        :cost="usageCost"
        :cache-rate="usageCacheRate"
        :requests="usageRequests"
        :heights="usageHeights"
        :has-trend="usageHasTrend"
        @open="requestLegacyPage('usage')"
        @retry="refreshDashboard"
      />
      <IpPurityCard
        :loading="purityState.loading"
        :error="purityState.error"
        :purity="purity"
        @open="requestLegacyPage('ipcheck')"
        @retry="refreshPurity(true)"
      />
      <ActivityRhythmCard
        :loading="activityState.loading"
        :error="activityState.error"
        :total="activityTotal"
        :peak="activityPeak"
        :heights="activityHeights"
        @retry="refreshDashboard"
      />
      <DaylightCard :daylight="daylight" />
      <YearProgressCard :progress="yearProgress" />
      <WeeklyFootprintCard
        :loading="activityState.loading"
        :error="activityState.error"
        :footprint="weeklyFootprint"
        @retry="refreshDashboard"
      />
      <AmbientPaletteCard :message="ambientMessage" :wave="ambientWave" />
      <MoonPhaseCard :moon="moon" />
    </div>
  </PageFrame>
</template>
