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

function preview(content: string) {
  return content.trim().replace(/\s+/g, ' ') || '还没有记录工作内容'
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
      <div>
        <strong>本周记录</strong>
        <span>{{ contentDayCount }} 天已有内容</span>
      </div>
      <span>{{ days.length }} DAYS</span>
    </div>

    <div class="notes-day-list" :class="{ 'notes-day-list--weekend': days.length === 7 }">
      <BaseSelectableItem
        v-for="day in days"
        :key="day.date"
        class="notes-day-item"
        :class="{ 'is-active': selectedDate === day.date, 'is-today': day.isToday }"
        :selected="selectedDate === day.date"
        :pressed="selectedDate === day.date"
        :data-save-state="day.note.saveState"
        :aria-pressed="selectedDate === day.date"
        :aria-label="`${day.weekday} ${day.fullDate}，${noteSaveLabel(day.note)}`"
        @click="$emit('select', day.date)"
      >
        <span class="notes-day-item__date">
          <strong>{{ day.dayNumber }}</strong>
          <span>{{ day.monthDay }}</span>
        </span>
        <span class="notes-day-item__copy">
          <span class="notes-day-item__heading">
            <strong>{{ day.weekday }}<small v-if="day.isToday">今天</small></strong>
            <i class="notes-save-dot" aria-hidden="true" />
          </span>
          <span class="notes-day-item__title">
            {{ day.note.title.trim() || (hasNoteContent(day.note) ? '未命名记录' : '等待记录') }}
          </span>
          <span class="notes-day-item__preview">{{ preview(day.note.content) }}</span>
        </span>
      </BaseSelectableItem>
    </div>

    <div class="notes-week-panel__footer">
      <span>本周记录覆盖</span>
      <span class="notes-week-progress" aria-hidden="true">
        <i :style="{ width: `${days.length ? contentDayCount / days.length * 100 : 0}%` }" />
      </span>
      <span>{{ contentDayCount }} / {{ days.length }}</span>
    </div>
  </BaseCard>
</template>
