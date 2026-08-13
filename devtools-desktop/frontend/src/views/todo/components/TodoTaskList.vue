<script setup lang="ts">
import { computed } from 'vue'

import BaseCard from '@/components/base/BaseCard.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'

import { todoTiming, type TodoDraft, type TodoFilter, type TodoLoadState } from '../composables/useTodo'

const props = defineProps<{
  todos: TodoDraft[]
  currentId: string
  search: string
  filter: TodoFilter
  activeCount: number
  doneCount: number
  listState: TodoLoadState
  listError: string
  now?: Date
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleDone: [id: string, done: boolean]
  retry: []
  'update:search': [value: string]
  'update:filter': [value: TodoFilter]
}>()

const filterOptions = computed<SegmentOption[]>(() => [
  { label: `进行中 ${props.activeCount}`, value: 'active' },
  { label: `已完成 ${props.doneCount}`, value: 'done' },
  { label: '全部', value: 'all' },
])

function dateLabel(value: string, withTime = false) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const day = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  if (!withTime) return day
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} ${time}`
}

function dueMeta(todo: TodoDraft) {
  if (todo.status === 'done') {
    const day = dateLabel(todo.updatedAt)
    return { label: day ? `${day} 完成` : '已完成', tone: 'none' as const }
  }
  const timing = todoTiming(todo, props.now)
  if (timing === 'today') {
    const time = new Date(todo.remindAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    return { label: `今天 ${time} 到期`, tone: 'today' as const }
  }
  if (timing === 'overdue') return { label: `已逾期 · ${dateLabel(todo.remindAt, true)}`, tone: 'overdue' as const }
  if (timing === 'future') return { label: `${dateLabel(todo.remindAt, true)} 提醒`, tone: 'none' as const }
  return { label: '无截止', tone: 'none' as const }
}

function progress(todo: TodoDraft) {
  return `${todo.checklist.filter((item) => item.done).length}/${todo.checklist.length}`
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
    <div class="todo-list-panel__head">
      <BaseInput
        class="todo-list-panel__search"
        :model-value="search"
        type="search"
        variant="search"
        size="sm"
        placeholder="搜索待办…"
        aria-label="搜索待办任务"
        @update:model-value="emit('update:search', $event)"
      >
        <template #prefix><span aria-hidden="true">⌕</span></template>
      </BaseInput>
      <BaseSegmented
        :model-value="filter"
        :options="filterOptions"
        aria-label="任务筛选"
        @update:model-value="emit('update:filter', $event as TodoFilter)"
      />
    </div>

    <div v-if="listState === 'loading'" class="todo-list-panel__state">
      <LoadingState label="正在加载任务…" compact />
    </div>
    <div v-else-if="listState === 'error'" class="todo-list-panel__state">
      <ErrorState title="任务加载失败" :description="listError" compact @retry="emit('retry')" />
    </div>
    <div v-else-if="todos.length === 0" class="todo-list-panel__state">
      <EmptyState
        :title="activeCount + doneCount === 0 ? '还没有待办' : '没有找到匹配任务'"
        :description="activeCount + doneCount === 0 ? '点击右上角「＋ 新建待办」开始' : '换一个关键词或筛选条件试试'"
      />
    </div>
    <div v-else class="todo-rows">
      <BaseSelectableItem
        v-for="todo in todos"
        :key="todo.id"
        class="todo-task-row"
        :class="{ 'is-done': todo.status === 'done' }"
        appearance="row"
        :selected="currentId === todo.id"
        :pressed="currentId === todo.id"
        :data-status="todo.status"
        :data-test="`todo-row-${todo.id}`"
        @click="emit('select', todo.id)"
      >
        <span class="todo-task-row__check" @click.stop>
          <BaseCheckbox
            :model-value="todo.status === 'done'"
            :label="`标记完成：${todo.title || '无标题任务'}`"
            :label-visible="false"
            @update:model-value="emit('toggleDone', todo.id, $event)"
          />
        </span>
        <span class="todo-task-row__main">
          <span class="todo-task-row__title">{{ todo.title || '无标题任务' }}</span>
          <span class="todo-task-row__meta">
            <span
              class="todo-task-row__due"
              :class="{ 'is-today': dueMeta(todo).tone === 'today', 'is-overdue': dueMeta(todo).tone === 'overdue' }"
            >{{ dueMeta(todo).label }}</span>
            <span v-if="todo.status === 'doing'" class="todo-task-row__doing">进行中</span>
            <span v-if="todo.checklist.length">子任务 {{ progress(todo) }}</span>
          </span>
        </span>
      </BaseSelectableItem>
    </div>
  </BaseCard>
</template>
