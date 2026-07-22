<script setup lang="ts">
import type { DaylightData } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ daylight: DaylightData }>()
</script>

<template>
  <section class="g-card daylight-card" aria-labelledby="home-daylight-title">
    <HomeCardHeader label="Daylight" title="昼夜进度" title-id="home-daylight-title" hint="武汉" />
    <div class="daylight-readout"><strong>{{ daylight.percent }}%</strong><span>白昼已走过</span></div>
    <div class="daylight-track" :style="{ '--daylight-progress': `${daylight.percent}%` }" aria-hidden="true"><i /><b /></div>
    <div class="sun-times"><span>日出<b>{{ daylight.sunrise }}</b></span><span>日落<b>{{ daylight.sunset }}</b></span></div>
  </section>
</template>
