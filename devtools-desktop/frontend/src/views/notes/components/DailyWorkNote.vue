<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseTextarea from '@/components/form/BaseTextarea.vue'

import { noteSaveLabel, type WeekDayEntry } from '../composables/useWeeklyNotes'

const props = defineProps<{ day: WeekDayEntry }>()
const emit = defineEmits<{
  'update:title': [value: string]
  'update:content': [value: string]
  retryLoad: []
  retrySave: []
}>()

const characterCount = computed(() => props.day.note.content.trim().length)
const showBlockingLoadError = computed(() => (
  props.day.note.loadState === 'error'
  && !props.day.note.title
  && !props.day.note.content
  && props.day.note.revision === 0
))
</script>

<template>
  <BaseCard
    class="notes-editor-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    content-background="var(--notes-editor-content-background)"
    fill-height
  >
    <header class="notes-editor-panel__header">
      <div class="notes-selected-day">
        <span class="notes-selected-day__number">{{ day.dayNumber }}</span>
        <span class="notes-selected-day__copy">
          <strong>
            {{ day.weekday }}
            <small v-if="day.isToday" class="notes-today-badge">今天</small>
          </strong>
          <span>{{ day.fullDate }}</span>
        </span>
      </div>
      <div class="notes-editor-panel__header-meta">
        <span class="notes-editor-count">字数 {{ characterCount }}</span>
        <div class="notes-editor-save-state" :data-state="day.note.saveState" role="status" aria-live="polite">
          <i class="notes-save-dot" aria-hidden="true" />
          <span>{{ noteSaveLabel(day.note) }}</span>
        </div>
      </div>
    </header>

    <div v-if="day.note.loadState === 'loading' && day.note.revision === 0" class="notes-editor-panel__state">
      <LoadingState label="正在加载当天记录…" />
    </div>
    <div v-else-if="showBlockingLoadError" class="notes-editor-panel__state">
      <ErrorState title="当天记录加载失败" :description="day.note.loadError" @retry="emit('retryLoad')" />
    </div>
    <div v-else class="notes-editor-panel__body">
      <div v-if="day.note.loadState === 'error'" class="notes-editor-inline-error" role="alert">
        <span>服务暂不可用，当前会话草稿已保留。</span>
        <BaseButton variant="ghost" size="sm" @click="emit('retryLoad')">重新加载</BaseButton>
      </div>
      <div v-if="day.note.saveState === 'error'" class="notes-editor-inline-error" role="alert">
        <span>{{ day.note.saveError }}</span>
        <BaseButton variant="ghost" size="sm" @click="emit('retrySave')">重新保存</BaseButton>
      </div>
      <BaseInput
        class="notes-editor-title"
        label="项目 / 标题"
        label-variant="eyebrow"
        variant="title"
        size="lg"
        :model-value="day.note.title"
        placeholder="今天主要推进了什么？"
        autocomplete="off"
        @update:model-value="emit('update:title', $event)"
      />
      <BaseTextarea
        class="notes-editor-content"
        label="工作内容"
        label-variant="eyebrow"
        variant="editor"
        resize="none"
        fill-height
        :rows="12"
        :model-value="day.note.content"
        placeholder="记录完成事项、关键决定或下一步安排…"
        @update:model-value="emit('update:content', $event)"
      />
    </div>

    <footer class="notes-editor-panel__footer">
      <span>停止输入 800ms 后自动保存</span>
      <span>切换日期或周次前会先保存当前内容</span>
    </footer>
  </BaseCard>
</template>
