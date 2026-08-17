<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseSwitch from '@/components/form/BaseSwitch.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { navigateToPage } from '@/router/navigate'
import { useNotificationStore } from '@/stores/notification'

import DailyWorkNote from './components/DailyWorkNote.vue'
import ReportReferencePanel, {
  type GitActivityItem,
  type ReferenceInsertMode,
} from './components/ReportReferencePanel.vue'
import WeekDayList from './components/WeekDayList.vue'
import WeekNavigator from './components/WeekNavigator.vue'
import { useWeeklyNotes } from './composables/useWeeklyNotes'
import { gitActivityAlreadyInserted, gitActivityInsertLine } from './git-activity-text'
import './notes.css'

defineOptions({ name: 'NotesView' })

const {
  weekOffset,
  showWeekend,
  selectedDate,
  weekDates,
  days,
  selectedDay,
  weekLabel,
  weekCaption,
  contentDayCount,
  globalStatus,
  selectDate,
  changeWeek,
  goToCurrentWeek,
  setShowWeekend,
  updateNote,
  getNoteContent,
  flushAll,
  retryLoad,
  retrySave,
} = useWeeklyNotes()

const notifications = useNotificationStore()
const referenceOpen = ref(false)
const lastReferenceInsert = ref<{ previousContents: Record<string, string> } | null>(null)
const referenceNoteContents = computed(() => Object.fromEntries(
  weekDates.value.map((date) => [date, getNoteContent(date)]),
))

function openSettings() {
  referenceOpen.value = false
  void flushAll()
  void navigateToPage('settings')
}

function referenceTargetDate(item: GitActivityItem, mode: ReferenceInsertMode, targetDate?: string) {
  if (mode === 'commit') return item.date
  if (mode === 'target') return targetDate || selectedDate.value
  return selectedDate.value
}

function insertReferenceItems(items: GitActivityItem[], mode: ReferenceInsertMode, targetDate?: string) {
  const previousContents: Record<string, string> = {}
  let insertedCount = 0

  items.forEach((item) => {
    const date = referenceTargetDate(item, mode, targetDate)
    if (!weekDates.value.includes(date)) return

    const currentContent = getNoteContent(date)
    if (gitActivityAlreadyInserted(currentContent, item)) return
    if (!(date in previousContents)) previousContents[date] = currentContent

    const line = gitActivityInsertLine(item.subject)
    if (!line) return
    const trimmed = currentContent.trimEnd()
    const nextContent = trimmed ? `${trimmed}\n${line}` : line
    updateNote(date, 'content', nextContent)
    insertedCount += 1
  })

  if (insertedCount === 0) {
    notifications.push('所选提交已经加入对应工时日期', 'warning')
    return
  }

  lastReferenceInsert.value = { previousContents }
  notifications.push(
    mode === 'commit'
      ? `已按提交日期加入 ${insertedCount} 条 Git 活动`
      : `已加入 ${targetDate || selectedDate.value} · 可撤销`,
    'success',
  )
}

function undoReferenceInsert() {
  if (!lastReferenceInsert.value) return
  Object.entries(lastReferenceInsert.value.previousContents).forEach(([date, content]) => {
    updateNote(date, 'content', content)
  })
  lastReferenceInsert.value = null
  notifications.push('已撤销上次 Git 活动写入', 'success')
}
</script>

<template>
  <PageFrame class="notes-view" variant="workspace">
    <template #top>
      <PageTop>
        <PageHeader title="工时内容" description="把一周放在眼前，只专注记录此刻的一天">
          <template #icon><span class="notes-view__title-dot" /></template>
          <template #actions>
            <StatusIndicator :label="globalStatus.label" :status="globalStatus.status" />
            <BaseSwitch
              class="notes-weekend-switch"
              :model-value="showWeekend"
              label="显示周末"
              @update:model-value="setShowWeekend"
            />
            <BaseButton
              variant="secondary"
              :aria-expanded="referenceOpen"
              aria-controls="notes-reference-panel"
              @click="referenceOpen = !referenceOpen"
            >Git 活动参考</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <WeekNavigator
            :week-label="weekLabel"
            :week-caption="weekCaption"
            :is-current-week="weekOffset === 0"
            @previous="changeWeek(-1)"
            @next="changeWeek(1)"
            @current="goToCurrentWeek"
          />
        </PageToolbar>
      </PageTop>
    </template>

    <div v-if="selectedDay" class="notes-workspace" :class="{ 'is-reference-open': referenceOpen }">
      <WeekDayList
        :days="days"
        :selected-date="selectedDate"
        :content-day-count="contentDayCount"
        @select="selectDate"
      />
      <DailyWorkNote
        :key="selectedDay.date"
        :day="selectedDay"
        @update:title="updateNote(selectedDay.date, 'title', $event)"
        @update:content="updateNote(selectedDay.date, 'content', $event)"
        @retry-load="retryLoad"
        @retry-save="retrySave(selectedDay.date)"
      />
      <ReportReferencePanel
        id="notes-reference-panel"
        :open="referenceOpen"
        :week-label="weekLabel"
        :week-dates="weekDates"
        :selected-date="selectedDate"
        :note-contents="referenceNoteContents"
        :can-undo="Boolean(lastReferenceInsert)"
        @close="referenceOpen = false"
        @open-settings="openSettings"
        @select-date="selectDate"
        @insert="insertReferenceItems"
        @undo="undoReferenceInsert"
      />
    </div>
  </PageFrame>
</template>
