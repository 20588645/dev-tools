<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseProgress from '@/components/base/BaseProgress.vue'
import { useInterval } from '@/composables/use-interval'

import { calculateWeekNumber, formatLunarDate } from '../composables/useHomeDashboard'
import HomeCardHeader from './HomeCardHeader.vue'

const now = ref(new Date())
useInterval(() => {
  now.value = new Date()
}, 1000)

const pad = (value: number) => String(value).padStart(2, '0')

const timeMain = computed(() => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}`)
const timeSeconds = computed(() => `:${pad(now.value.getSeconds())}`)
const dateLabel = computed(() => {
  const d = now.value
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 星期${'日一二三四五六'[d.getDay()]}`
})
const lunarLabel = computed(() => {
  const lunar = formatLunarDate(now.value)
  const week = `第 ${calculateWeekNumber(now.value)} 周`
  return lunar ? `农历${lunar} · ${week}` : week
})
const timezoneLabel = computed(() => {
  const offset = -now.value.getTimezoneOffset() / 60
  return `GMT${offset >= 0 ? '+' : ''}${offset} · 本地时间`
})
const dayPercent = computed(() => {
  const start = new Date(now.value)
  start.setHours(0, 0, 0, 0)
  return (now.value.getTime() - start.getTime()) / 864e5 * 100
})
const phaseLabel = computed(() => {
  const hour = now.value.getHours()
  if (hour < 6) return '凌晨 · 适合休息'
  if (hour < 9) return '清晨 · 新的一天'
  if (hour < 12) return '上午 · 精力充沛'
  if (hour < 14) return '午后 · 小憩片刻'
  if (hour < 18) return '下午 · 保持专注'
  if (hour < 20) return '傍晚 · 放松一下'
  if (hour < 23) return '夜晚 · 适合复盘'
  return '深夜 · 早点休息'
})
</script>

<template>
  <section class="hcard clock-card" aria-labelledby="home-clock-title">
    <HomeCardHeader title="时钟" :hint="timezoneLabel" title-id="home-clock-title" />
    <div class="hcard-body">
      <div class="clock-stage">
        <div class="clock-time"><span>{{ timeMain }}</span><small>{{ timeSeconds }}</small></div>
        <div class="clock-date">{{ dateLabel }}</div>
        <div class="clock-lunar">{{ lunarLabel }}</div>
      </div>
      <div class="clock-foot">
        <BaseProgress :value="dayPercent" :stroke-width="8" :label="`今日已过 ${dayPercent.toFixed(0)}%`" />
        <div class="clock-foot-row"><span>今日已过 {{ dayPercent.toFixed(0) }}%</span><span>{{ phaseLabel }}</span></div>
      </div>
    </div>
  </section>
</template>
