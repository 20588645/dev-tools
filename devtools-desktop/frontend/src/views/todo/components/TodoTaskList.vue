<script setup lang="ts">
import BaseCard from '@/components/base/BaseCard.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import type { TodoStatus } from '@/services/modules/todo-service'

import { todoTiming, type TodoDraft, type TodoLoadState } from '../composables/useTodo'

defineProps<{
  groups: Record<TodoStatus, TodoDraft[]>
  currentId: string
  collapsed: Record<TodoStatus, boolean>
  visibleCount: number
  listState: TodoLoadState
  listError: string
  now?: Date
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleGroup: [status: TodoStatus]
  retry: []
}>()

const statusMeta: Record<TodoStatus, { label: string; symbol: string }> = {
  todo: { label: '待办', symbol: '○' },
  doing: { label: '进行中', symbol: '▷' },
  done: { label: '已完成', symbol: '✓' },
}

function progress(todo: TodoDraft) {
  return `${todo.checklist.filter((item) => item.done).length}/${todo.checklist.length}`
}

function dateLabel(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
</script>

<template>
  <BaseCard
    class="todo-list-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    fill-height
  >
    <div class="todo-list-panel__summary">
      <strong>个人任务</strong>
      <span><b>{{ visibleCount }}</b> 条可见任务</span>
    </div>

    <div v-if="listState === 'loading'" class="todo-list-panel__state">
      <LoadingState label="正在加载任务…" compact />
    </div>
    <div v-else-if="listState === 'error'" class="todo-list-panel__state">
      <ErrorState title="任务加载失败" :description="listError" compact @retry="emit('retry')" />
    </div>
    <div v-else-if="visibleCount === 0" class="todo-list-panel__state">
      <EmptyState title="没有找到匹配任务" description="换一个关键词或筛选条件试试" />
    </div>
    <div v-else class="todo-groups">
      <BaseDisclosure
        v-for="status in (['todo', 'doing', 'done'] as TodoStatus[])"
        v-show="groups[status].length"
        :key="status"
        class="todo-group"
        :data-test="`todo-group-${status}`"
        :model-value="!collapsed[status]"
        variant="plain"
        header-padding="0"
        header-min-height="42px"
        content-padding="0 4px 8px"
        @update:model-value="emit('toggleGroup', status)"
      >
        <template #header>
          <span class="todo-group__heading-content">
            <span class="todo-group__dot" :data-status="status" aria-hidden="true" />
            <strong>{{ statusMeta[status].label }}</strong>
            <span class="todo-group__count">{{ groups[status].length }}</span>
          </span>
        </template>
        <div class="todo-group__list">
          <BaseSelectableItem
            v-for="todo in groups[status]"
            :key="todo.id"
            class="todo-task-row"
            appearance="row"
            :selected="currentId === todo.id"
            :pressed="currentId === todo.id"
            :data-status="todo.status"
            :data-test="`todo-row-${todo.id}`"
            @click="emit('select', todo.id)"
          >
            <span class="todo-task-row__state" aria-hidden="true">{{ statusMeta[todo.status].symbol }}</span>
            <span class="todo-task-row__main">
              <span class="todo-task-row__title">{{ todo.title || '无标题任务' }}</span>
              <span class="todo-task-row__preview">{{ todo.description || '暂无任务描述' }}</span>
            </span>
            <span class="todo-task-row__meta">
              <span v-if="todo.checklist.length" class="todo-meta-chip">☷ {{ progress(todo) }}</span>
              <span
                v-if="todoTiming(todo, now) === 'today'"
                class="todo-meta-chip is-today"
              >今天</span>
              <span
                v-else-if="todoTiming(todo, now) === 'overdue'"
                class="todo-meta-chip is-overdue"
              >已逾期</span>
              <small>{{ dateLabel(todo.remindAt || todo.createdAt) }}</small>
            </span>
          </BaseSelectableItem>
        </div>
      </BaseDisclosure>
    </div>
  </BaseCard>
</template>
