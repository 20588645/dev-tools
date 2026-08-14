<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'

import { WEEKDAY_LABELS, buildMonthCalendar, type CalendarCell } from '../composables/home-almanac'
import HomeCardHeader from './HomeCardHeader.vue'

const props = defineProps<{ today: Date }>()

const viewYear = ref(props.today.getFullYear())
const viewMonth = ref(props.today.getMonth())

watch(
  () => `${props.today.getFullYear()}-${props.today.getMonth()}`,
  (stamp, previous) => {
    if (!previous) return
    if (viewYear.value === Number(previous.split('-')[0]) && viewMonth.value === Number(previous.split('-')[1])) {
      viewYear.value = props.today.getFullYear()
      viewMonth.value = props.today.getMonth()
    }
  },
)

const viewDate = computed(() => new Date(viewYear.value, viewMonth.value, 1))
const calendar = computed(() => buildMonthCalendar(viewDate.value, props.today))

function shiftMonth(delta: number) {
  const next = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = next.getFullYear()
  viewMonth.value = next.getMonth()
}

function goToday() {
  viewYear.value = props.today.getFullYear()
  viewMonth.value = props.today.getMonth()
}

function openCell(cell: CalendarCell) {
  if (cell.inMonth) return
  viewYear.value = cell.date.getFullYear()
  viewMonth.value = cell.date.getMonth()
}

function cellLabel(cell: CalendarCell) {
  const parts = [`${cell.day}日`]
  if (cell.badge) parts.push(cell.badge === '休' ? '放假' : '调休上班')
  if (cell.note) parts.push(cell.note)
  return parts.join(' · ')
}
</script>

<template>
  <section class="hcard calendar-card" aria-labelledby="home-calendar-title">
    <HomeCardHeader title="日历" :hint="calendar.monthLabel" title-id="home-calendar-title">
      <template #action>
        <div class="cal-nav">
          <BaseButton v-if="!calendar.isCurrentMonth" variant="ghost" size="sm" @click="goToday">今天</BaseButton>
          <BaseButton variant="outline" size="sm" aria-label="上个月" @click="shiftMonth(-1)">‹</BaseButton>
          <BaseButton variant="outline" size="sm" aria-label="下个月" @click="shiftMonth(1)">›</BaseButton>
        </div>
      </template>
    </HomeCardHeader>
    <div class="hcard-body">
      <div class="cal-weekdays" aria-hidden="true">
        <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
      </div>
      <div class="cal-grid" role="grid" :aria-label="calendar.monthLabel">
        <div
          v-for="cell in calendar.cells"
          :key="cell.key"
          class="cal-cell"
          :class="{
            'is-out': !cell.inMonth,
            'is-today': cell.isToday,
            'is-weekend': cell.isWeekend && !cell.badge,
            'is-off': cell.badge === '休',
            'is-shift': cell.badge === '班',
          }"
          role="gridcell"
          tabindex="0"
          :aria-current="cell.isToday ? 'date' : undefined"
          :aria-label="cellLabel(cell)"
          @click="openCell(cell)"
          @keydown.enter.prevent="openCell(cell)"
          @keydown.space.prevent="openCell(cell)"
        >
          <span v-if="cell.badge" class="cal-badge">{{ cell.badge }}</span>
          <span class="cal-day">{{ cell.day }}</span>
          <span v-if="cell.note" class="cal-note">{{ cell.note }}</span>
        </div>
      </div>
      <div class="cal-foot">
        <span>{{ calendar.footHint }}</span>
        <span>休放假 · 班调休</span>
      </div>
    </div>
  </section>
</template>
