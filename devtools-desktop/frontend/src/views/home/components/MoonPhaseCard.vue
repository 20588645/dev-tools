<script setup lang="ts">
import type { MoonPhaseData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ moon: MoonPhaseData }>()
</script>

<template>
  <section class="g-card moon-card" aria-labelledby="home-moon-title">
    <HomeCardHeader label="Moon" title="月相" title-id="home-moon-title" hint="今夜" />
    <div class="moon-main">
      <div class="moon-cycle" aria-label="本月月相周期">
        <div class="moon-cycle-plot" aria-hidden="true">
          <svg viewBox="0 0 100 34" preserveAspectRatio="none">
            <path class="moon-cycle-area" d="M2 30 C18 30 24 4 50 4 C76 4 82 30 98 30 L98 33 L2 33 Z" />
            <path class="moon-cycle-line" d="M2 30 C18 30 24 4 50 4 C76 4 82 30 98 30" />
          </svg>
          <i class="moon-cycle-marker" :style="{ left: `${moon.position}%`, top: `${moon.markerTop}%` }" />
        </div>
        <div class="moon-cycle-axis"><span>新月</span><span>满月</span><span>新月</span></div>
      </div>
      <div class="moon-copy">
        <strong>{{ moon.name }}</strong>
        <span>月龄 {{ moon.age.toFixed(1) }} 天 · {{ moon.dateLabel }}</span>
        <small class="moon-light">照明度 <b>{{ moon.illumination }}%</b></small>
      </div>
    </div>
  </section>
</template>
