<script setup lang="ts">
import { computed } from 'vue'

import type { DaylightData } from '../composables/useHomeDashboard'
import {
  DAYLIGHT_ARC,
  DAYLIGHT_ARC_LENGTH,
  DAYLIGHT_GROUND,
  DAYLIGHT_HILL,
  DAYLIGHT_HORIZON,
  DAYLIGHT_VIEW_HEIGHT,
  DAYLIGHT_VIEW_WIDTH,
  daylightElapsedWidth,
  daylightMarkerStyle,
  daylightProgressLength,
} from '../composables/home-daylight-path'
import HomeCardHeader from './HomeCardHeader.vue'

const props = defineProps<{ daylight: DaylightData }>()

const markerStyle = computed(() => daylightMarkerStyle(props.daylight.isDay, props.daylight.sunT, props.daylight.nightT))
const progressDash = computed(() => (
  `${daylightProgressLength(props.daylight.isDay, props.daylight.sunT)} ${DAYLIGHT_ARC_LENGTH}`
))
const elapsedWidth = computed(() => daylightElapsedWidth(props.daylight.isDay, props.daylight.sunT))
</script>

<template>
  <section class="hcard daylight-card" aria-labelledby="home-daylight-title">
    <HomeCardHeader title="昼夜" :hint="`白昼 ${daylight.dayLength}`" title-id="home-daylight-title" />
    <div class="hcard-body">
      <div
        class="day-sky"
        :class="daylight.isDay ? 'is-day' : 'is-night'"
        aria-hidden="true"
      >
        <svg
          :viewBox="`0 0 ${DAYLIGHT_VIEW_WIDTH} ${DAYLIGHT_VIEW_HEIGHT}`"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="home-daylight-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" class="day-sky-fill-strong" />
              <stop offset="100%" class="day-sky-fill-faint" />
            </linearGradient>
            <clipPath id="home-daylight-elapsed">
              <rect x="0" y="0" :width="elapsedWidth" :height="DAYLIGHT_VIEW_HEIGHT" />
            </clipPath>
          </defs>
          <path class="day-sky-rest" :d="DAYLIGHT_HILL" />
          <path
            :d="DAYLIGHT_HILL"
            fill="url(#home-daylight-sky)"
            clip-path="url(#home-daylight-elapsed)"
          />
          <path class="day-sky-ground" :d="DAYLIGHT_GROUND" />
          <path class="day-sky-horizon" :d="DAYLIGHT_HORIZON" />
          <path class="day-sky-track" :d="DAYLIGHT_ARC" fill="none" />
          <path
            class="day-sky-progress"
            :d="DAYLIGHT_ARC"
            fill="none"
            :stroke-dasharray="progressDash"
          />
        </svg>
        <span class="day-orb" :class="daylight.isDay ? 'is-day' : 'is-night'" :style="markerStyle" />
      </div>
      <div class="sun-times"><span>日出 {{ daylight.sunrise }}</span><span>正午 {{ daylight.noon }}</span><span>日落 {{ daylight.sunset }}</span></div>
      <div class="sun-meta"><span>{{ daylight.statusLabel }}</span><b>{{ daylight.countdownLabel }}</b></div>
    </div>
  </section>
</template>
