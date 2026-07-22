<script setup lang="ts">
import type { HOME_WEATHER_MOCK } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  clockLabel: string
  weather: typeof HOME_WEATHER_MOCK
}>()
</script>

<template>
  <section class="g-card today-card" aria-labelledby="home-today-title">
    <div class="today-content">
      <HomeCardHeader label="Now · Wuhan" title="此刻" title-id="home-today-title" :hint="weather.timezone" />
      <strong class="today-time mono">{{ clockLabel }}</strong>
      <div class="today-weather">
        <strong>{{ weather.temperature }}°C</strong>
        <span>{{ weather.condition }} · 体感 {{ weather.feelsLike }}°C</span>
      </div>
      <div class="today-meta">
        <span>湿度 {{ weather.humidity }}%</span>
        <span>风速 {{ weather.windSpeed }} m/s</span>
      </div>
    </div>
    <div class="temperature-profile" :aria-label="`静态天气展示：今日最低 ${weather.low} 度，最高 ${weather.high} 度`">
      <div class="temperature-summary"><span>今日温差</span><strong>{{ weather.low }}°<i>—</i>{{ weather.high }}°</strong></div>
      <div class="temperature-chart" aria-hidden="true">
        <svg viewBox="0 0 132 52" preserveAspectRatio="none">
          <path class="temperature-grid" d="M2 47H130 M2 28H130 M2 9H130" />
          <path class="temperature-area" d="M2 43 C16 42 25 39 37 33 C51 25 59 13 72 10 C85 8 94 16 104 24 C115 32 122 35 130 37 L130 49 L2 49 Z" />
          <path class="temperature-marker" d="M76 8V48" />
          <path class="temperature-line" d="M2 43 C16 42 25 39 37 33 C51 25 59 13 72 10 C85 8 94 16 104 24 C115 32 122 35 130 37" />
          <circle class="temperature-point" cx="76" cy="10" r="3" />
        </svg>
      </div>
      <div class="temperature-labels"><span>08</span><span>14</span><span>20</span></div>
    </div>
  </section>
</template>
