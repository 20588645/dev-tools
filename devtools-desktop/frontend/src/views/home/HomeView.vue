<script setup lang="ts">
import { onActivated, onDeactivated, ref } from 'vue'

import PageFrame from '@/components/layout/PageFrame.vue'
import { navigateToPage } from '@/router/navigate'

import AmbientPaletteCard from './components/AmbientPaletteCard.vue'
import CalendarCard from './components/CalendarCard.vue'
import ClockCard from './components/ClockCard.vue'
import DailyQuoteCard from './components/DailyQuoteCard.vue'
import DaylightCard from './components/DaylightCard.vue'
import IpPurityCard from './components/IpPurityCard.vue'
import PhenologyWeekCard from './components/PhenologyWeekCard.vue'
import UsageSummaryCard from './components/UsageSummaryCard.vue'
import YearProgressCard from './components/YearProgressCard.vue'
import { useHomeDashboard } from './composables/useHomeDashboard'
import './home.css'

defineOptions({ name: 'HomeView' })

/** KeepAlive：用 activated 驱动刷新 */
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
  daylight,
  yearProgress,
  now,
  phenologyWeek,
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
      <CalendarCard :today="now" />
      <PhenologyWeekCard :week="phenologyWeek" />
      <AmbientPaletteCard :palette="ambientPalette" />
    </div>
  </PageFrame>
</template>
