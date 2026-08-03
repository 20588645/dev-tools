<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import BaseTextarea from '@/components/form/BaseTextarea.vue'
import type { TodoStatus } from '@/services/modules/todo-service'

import { todoSaveLabel, todoTiming, type TodoDraft } from '../composables/useTodo'
import type { TodoChecklistItem } from '../todo-content'
import TodoChecklist from './TodoChecklist.vue'

const props = defineProps<{
  todo: TodoDraft | null
  narrowDetailOpen: boolean
}>()

const emit = defineEmits<{
  updateField: [field: 'title' | 'description' | 'remindAt', value: string]
  updateChecklist: [index: number, patch: Partial<Pick<TodoChecklistItem, 'text' | 'done'>>]
  addChecklist: [index?: number]
  removeChecklist: [index: number]
  requestStatus: [status: TodoStatus]
  delete: []
  back: []
  retrySave: []
}>()

const statusOptions = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
]

const progress = computed(() => {
  const checklist = props.todo?.checklist ?? []
  return `${checklist.filter((item) => item.done).length}/${checklist.length}`
})

const timing = computed(() => props.todo ? todoTiming(props.todo) : 'none')

function dateLabel(value: string) {
  if (!value) return '未设置提醒'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '未设置提醒'
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function nextStatus(status: TodoStatus): TodoStatus {
  if (status === 'todo') return 'doing'
  if (status === 'doing') return 'done'
  return 'doing'
}

function nextLabel(status: TodoStatus) {
  if (status === 'todo') return '开始执行'
  if (status === 'doing') return '完成任务'
  return '重新开始'
}
</script>

<template>
  <BaseCard
    class="todo-detail-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    fill-height
  >
    <div v-if="narrowDetailOpen" class="todo-detail-panel__mobile-top">
      <BaseButton variant="ghost" size="sm" @click="emit('back')">← 返回任务列表</BaseButton>
    </div>
    <div v-if="todo" class="todo-detail">
      <div class="todo-detail__title">
        <BaseInput
          :model-value="todo.title"
          text-variant="strong"
          aria-label="任务标题"
          placeholder="输入任务标题"
          :error="!todo.title.trim() ? '任务标题不能为空' : undefined"
          @update:model-value="emit('updateField', 'title', $event)"
        />
        <BaseSelect
          :model-value="todo.status"
          :options="statusOptions"
          aria-label="任务状态"
          @update:model-value="emit('requestStatus', $event as TodoStatus)"
        />
      </div>

      <div class="todo-detail__meta">
        <BaseBadge :tone="timing === 'overdue' ? 'danger' : timing === 'today' ? 'info' : 'neutral'">
          ◷ {{ dateLabel(todo.remindAt) }}
        </BaseBadge>
        <BaseBadge tone="neutral">☷ {{ progress }}</BaseBadge>
        <BaseButton
          v-if="todo.saveState === 'error'"
          class="todo-detail__save is-error"
          variant="ghost"
          size="sm"
          @click="emit('retrySave')"
        >保存失败 · 点击重试</BaseButton>
        <span v-else class="todo-detail__save">{{ todoSaveLabel(todo) }}</span>
      </div>

      <section class="todo-detail__section">
        <h2>任务描述 / 备注</h2>
        <BaseTextarea
          :model-value="todo.description"
          text-variant="relaxed"
          placeholder="补充目标、背景或完成标准"
          :rows="5"
          @update:model-value="emit('updateField', 'description', $event)"
        />
      </section>

      <section class="todo-detail__section todo-detail__check-section">
        <div class="todo-detail__section-heading">
          <h2>任务清单 / 子步骤</h2>
          <BaseButton variant="ghost" size="sm" @click="emit('addChecklist')">＋ 添加子项</BaseButton>
        </div>
        <TodoChecklist
          :items="todo.checklist"
          @update="(index, patch) => emit('updateChecklist', index, patch)"
          @add="emit('addChecklist', $event)"
          @remove="emit('removeChecklist', $event)"
        />
      </section>

      <div class="todo-detail__actions">
        <BaseButton variant="danger" size="sm" @click="emit('delete')">删除任务</BaseButton>
        <BaseButton
          size="sm"
          @click="emit('requestStatus', nextStatus(todo.status))"
        >{{ nextLabel(todo.status) }}</BaseButton>
      </div>
    </div>
    <div v-else class="todo-detail-panel__empty">
      <EmptyState title="选择一条任务" description="从左侧列表选择任务后即可查看和编辑详情" />
    </div>
  </BaseCard>
</template>
