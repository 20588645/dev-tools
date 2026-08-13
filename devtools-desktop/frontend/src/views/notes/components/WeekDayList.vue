<script setup lang="ts">
import BaseCard from '@/components/base/BaseCard.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'

import { hasNoteContent, noteSaveLabel, type WeekDayEntry } from '../composables/useWeeklyNotes'

defineProps<{
  days: WeekDayEntry[]
  selectedDate: string
  contentDayCount: number
}>()

defineEmits<{ select: [date: string] }>()

function preview(day: WeekDayEntry) {
  const title = day.note.title.trim()
  const content = day.note.content.trim().replace(/\s+/g, ' ')
  if (title && content) return `${title} · ${content}`
  if (title || content) return title || content
  return '等待记录 · 还没有记录工作内容'
}
</script>

<template>
  <BaseCard
    class="notes-week-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    fill-height
  >
    <div class="notes-week-panel__header">
      <strong>本周记录</strong>
      <span>{{ contentDayCount }} 天已有内容 · {{ days.length }} DAYS</span>
    </div>

    <div class="notes-day-list" :class="{ 'notes-day-list--weekend': days.length === 7 }">
      <BaseSelectableItem
        v-for="day in days"
        :key="day.date"
        class="notes-day-item"
        :class="{
          'is-active': selectedDate === day.date,
          'is-today': day.isToday,
          'has-content': hasNoteContent(day.note),
        }"
        :selected="selectedDate === day.date"
        :pressed="selectedDate === day.date"
        :data-save-state="day.note.saveState"
        :aria-pressed="selectedDate === day.date"
        :aria-label="`${day.weekday} ${day.fullDate}，${noteSaveLabel(day.note)}`"
        @click="$emit('select', day.date)"
      >
        <span class="notes-day-item__num">{{ day.dayNumber }}</span>
        <span class="notes-day-item__info">
          <span class="notes-day-item__heading">
            <strong>{{ day.weekday }}</strong>
            <small v-if="day.isToday" class="notes-today-badge">今天</small>
          </span>
          <span class="notes-day-item__preview" :class="{ 'is-empty': !hasNoteContent(day.note) }">
            {{ preview(day) }}
          </span>
        </span>
        <i class="notes-save-dot" :class="{ 'is-empty': !hasNoteContent(day.note) }" aria-hidden="true" />
      </BaseSelectableItem>
    </div>

    <div class="notes-week-panel__footer">
      <span>本周记录覆盖</span>
      <span class="notes-week-progress" aria-hidden="true">
        <i :style="{ width: `${days.length ? contentDayCount / days.length * 100 : 0}%` }" />
      </span>
      <b>{{ contentDayCount }} / {{ days.length }}</b>
    </div>
  </BaseCard>
</template>
