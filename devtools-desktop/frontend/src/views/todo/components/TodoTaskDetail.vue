<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import BaseDateTimePicker from '@/components/form/BaseDateTimePicker.vue'
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

const dueBadge = computed(() => {
  if (!props.todo || timing.value === 'none') return null
  const date = new Date(props.todo.remindAt)
  const label = date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  if (timing.value === 'overdue') return { label: `已逾期 ${label}`, tone: 'danger' as const }
  if (timing.value === 'today') return { label: `今天 ${label.split(' ').at(-1)} 到期`, tone: 'warning' as const }
  return { label: `${label} 提醒`, tone: 'neutral' as const }
})

const createdLabel = computed(() => {
  if (!props.todo?.createdAt) return ''
  const date = new Date(props.todo.createdAt)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }).replace('/', '.')
})

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
      <div class="todo-detail__head">
        <BaseInput
          class="todo-detail__title"
          :model-value="todo.title"
          variant="plain"
          text-variant="strong"
          aria-label="任务标题"
          placeholder="输入任务标题"
          :error="!todo.title.trim() ? '任务标题不能为空' : undefined"
          @update:model-value="emit('updateField', 'title', $event)"
        />
        <BaseBadge v-if="dueBadge" :tone="dueBadge.tone === 'neutral' ? 'neutral' : dueBadge.tone">
          {{ dueBadge.label }}
        </BaseBadge>
        <BaseSelect
          class="todo-detail__status"
          :model-value="todo.status"
          :options="statusOptions"
          aria-label="任务状态"
          @update:model-value="emit('requestStatus', $event as TodoStatus)"
        />
        <BaseButton
          size="sm"
          @click="emit('requestStatus', nextStatus(todo.status))"
        >{{ nextLabel(todo.status) }}</BaseButton>
      </div>

      <div class="todo-detail__body">
        <section class="todo-detail__section">
          <h2>描述</h2>
          <BaseTextarea
            :model-value="todo.description"
            text-variant="relaxed"
            placeholder="补充目标、背景或完成标准"
            :rows="4"
            @update:model-value="emit('updateField', 'description', $event)"
          />
        </section>

        <section class="todo-detail__section">
          <h2>子任务 · {{ progress }}</h2>
          <TodoChecklist
            :items="todo.checklist"
            @update="(index, patch) => emit('updateChecklist', index, patch)"
            @add="emit('addChecklist', $event)"
            @remove="emit('removeChecklist', $event)"
          />
        </section>

        <section class="todo-detail__section todo-detail__section--remind">
          <h2>提醒时间</h2>
          <BaseDateTimePicker
            :model-value="todo.remindAt"
            placeholder="不提醒"
            @update:model-value="emit('updateField', 'remindAt', $event)"
          />
        </section>
      </div>

      <footer class="todo-detail__foot">
        <span v-if="todo.saveState === 'error'" class="todo-detail__save is-error">
          保存失败
          <BaseButton variant="ghost" size="sm" @click="emit('retrySave')">点击重试</BaseButton>
        </span>
        <span v-else class="todo-detail__save">
          创建于 {{ createdLabel }} · {{ todoSaveLabel(todo) }} · 自动保存
        </span>
        <BaseButton variant="danger" size="sm" @click="emit('delete')">删除任务</BaseButton>
      </footer>
    </div>
    <div v-else class="todo-detail-panel__empty">
      <EmptyState title="选择一条任务" description="从左侧列表选择任务后即可查看和编辑详情" />
    </div>
  </BaseCard>
</template>
