<script setup lang="ts">
import { computed } from 'vue'

import type { DaylightData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

const props = defineProps<{ daylight: DaylightData }>()

/** 日轨二次贝塞尔：P0(40,88) C(150,4) P1(260,88)，与原型一致 */
function arcPoint(t: number) {
  const x = (1 - t) ** 2 * 40 + 2 * (1 - t) * t * 150 + t ** 2 * 260
  const y = (1 - t) ** 2 * 88 + 2 * (1 - t) * t * 4 + t ** 2 * 88
  return { x, y }
}

/** 夜轨：左尾 M10,106 Q26,106 40,88（后半夜），右尾 M260,88 Q274,106 290,106（前半夜） */
function nightPoint(nightT: number) {
  if (nightT >= 0.5) {
    const t = (nightT - 0.5) * 2
    const x = (1 - t) ** 2 * 10 + 2 * (1 - t) * t * 26 + t ** 2 * 40
    const y = (1 - t) ** 2 * 106 + 2 * (1 - t) * t * 106 + t ** 2 * 88
    return { x, y }
  }
  const t = nightT * 2
  const x = (1 - t) ** 2 * 260 + 2 * (1 - t) * t * 274 + t ** 2 * 290
  const y = (1 - t) ** 2 * 88 + 2 * (1 - t) * t * 106 + t ** 2 * 106
  return { x, y }
}

const marker = computed(() => props.daylight.isDay ? arcPoint(props.daylight.sunT) : nightPoint(props.daylight.nightT))
</script>

<template>
  <section class="hcard daylight-card" aria-labelledby="home-daylight-title">
    <HomeCardHeader title="昼夜" :hint="`白昼 ${daylight.dayLength}`" title-id="home-daylight-title" />
    <div class="hcard-body">
      <div class="day-arc" aria-hidden="true">
        <svg viewBox="0 0 300 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="home-day-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style="stop-color: var(--color-warning)" stop-opacity=".45" />
              <stop offset=".5" style="stop-color: var(--color-warning)" />
              <stop offset="1" style="stop-color: var(--color-warning)" stop-opacity=".45" />
            </linearGradient>
            <linearGradient id="home-day-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style="stop-color: var(--color-warning)" stop-opacity=".2" />
              <stop offset="1" style="stop-color: var(--color-warning)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="M 40 88 Q 150 4 260 88 Z" fill="url(#home-day-fill)" />
          <line x1="10" y1="88" x2="290" y2="88" class="day-arc-horizon" stroke-width="1.4" stroke-dasharray="4 5" />
          <path d="M 40 88 Q 150 4 260 88" fill="none" stroke="url(#home-day-arc)" stroke-width="3" stroke-linecap="round" />
          <path d="M 10 106 Q 26 106 40 88" fill="none" class="day-arc-night" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round" />
          <path d="M 260 88 Q 274 106 290 106" fill="none" class="day-arc-night" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round" />
          <circle cx="40" cy="88" r="3.2" class="day-arc-sunmark" />
          <circle cx="260" cy="88" r="3.2" class="day-arc-sunmark" />
          <circle :cx="marker.x" :cy="marker.y" r="7.5" class="day-arc-halo" :class="daylight.isDay ? 'is-day' : 'is-night'" />
          <circle :cx="marker.x" :cy="marker.y" r="4" class="day-arc-marker" :class="daylight.isDay ? 'is-day' : 'is-night'" />
        </svg>
      </div>
      <div class="sun-times"><span>日出 {{ daylight.sunrise }}</span><span>正午 {{ daylight.noon }}</span><span>日落 {{ daylight.sunset }}</span></div>
      <div class="sun-meta"><span>{{ daylight.statusLabel }}</span><b>{{ daylight.countdownLabel }}</b></div>
    </div>
  </section>
</template>
