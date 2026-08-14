<script setup lang="ts">
import type { PhenologyWeekData } from '../composables/home-almanac'
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ week: PhenologyWeekData }>()
</script>

<template>
  <section class="hcard week-card phenology-card" aria-labelledby="home-phenology-title">
    <HomeCardHeader title="七日物候" :hint="week.hint" title-id="home-phenology-title" />
    <div class="hcard-body">
      <div class="pheno-week" :aria-label="`本周 ${week.range}，${week.hint}`">
        <div
          v-for="day in week.days"
          :key="day.key"
          class="pheno-day"
          :class="{ 'is-today': day.isToday, 'is-term': day.isTermDay, 'is-fest': Boolean(day.festival) }"
        >
          <span class="pheno-weekday">周{{ day.weekday }}</span>
          <span class="pheno-date">{{ day.day }}</span>
          <span class="pheno-caption">{{ day.caption }}</span>
          <span class="pheno-tag">{{ day.tag }}</span>
          <p class="pheno-advice"><span>{{ day.advice }}</span></p>
        </div>
      </div>
    </div>
  </section>
</template>
