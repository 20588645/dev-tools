<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageTop from '@/components/layout/PageTop.vue'
import type { TodoCreateInput, TodoStatus } from '@/services/modules/todo-service'
import { useNotificationStore } from '@/stores/notification'

import TodoCreateDialog from './components/TodoCreateDialog.vue'
import TodoTaskDetail from './components/TodoTaskDetail.vue'
import TodoTaskList from './components/TodoTaskList.vue'
import { useTodo } from './composables/useTodo'
import './todo.css'

defineOptions({ name: 'TodoView' })

const {
  visibleTodos,
  currentId,
  currentTodo,
  search,
  filter,
  listState,
  listError,
  completedCount,
  activeCount,
  todayDueCount,
  globalStatus,
  load,
  selectTodo,
  create,
  removeCurrent,
  clearCompleted,
  updateCurrent,
  updateChecklist,
  addChecklist,
  removeChecklist,
  setStatus,
  hasIncompleteChecklist,
  retryCurrentSave,
} = useTodo()

const notifications = useNotificationStore()
const createOpen = ref(false)
const creating = ref(false)
const confirmDelete = ref(false)
const confirmClear = ref(false)
const confirmComplete = ref(false)
const pendingStatus = ref<TodoStatus | null>(null)
const narrowDetailOpen = ref(false)

const headerSummary = computed(() => `${activeCount.value} 项进行中 · ${todayDueCount.value} 项今天到期`)
const incompleteChecklistCount = computed(() =>
  currentTodo.value?.checklist.filter((item) => !item.done).length ?? 0)
const clearMessage = computed(() => `将永久清理 ${completedCount.value} 条已完成待办，清理后不可恢复。`)

async function handleSelect(id: string) {
  await selectTodo(id)
  narrowDetailOpen.value = true
}

async function handleCreate(input: TodoCreateInput) {
  creating.value = true
  try {
    await create(input)
    createOpen.value = false
    narrowDetailOpen.value = true
    notifications.push('待办已创建', 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '创建待办失败', 'error')
  } finally {
    creating.value = false
  }
}

async function handleDelete() {
  try {
    await removeCurrent()
    confirmDelete.value = false
    narrowDetailOpen.value = false
    notifications.push('任务已删除', 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '删除任务失败', 'error')
  }
}

async function handleClear() {
  try {
    const deleted = await clearCompleted()
    confirmClear.value = false
    notifications.push(`已清理 ${deleted} 条已完成待办`, 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '清理已完成待办失败', 'error')
  }
}

async function applyStatus(status: TodoStatus) {
  try {
    await setStatus(status)
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '更新任务状态失败', 'error')
  }
}

function requestStatus(status: TodoStatus) {
  if (status === 'done' && hasIncompleteChecklist()) {
    pendingStatus.value = status
    confirmComplete.value = true
    return
  }
  void applyStatus(status)
}

async function handleToggleDone(id: string, done: boolean) {
  await selectTodo(id)
  requestStatus(done ? 'done' : 'todo')
}

async function confirmParentCompletion() {
  const status = pendingStatus.value
  confirmComplete.value = false
  pendingStatus.value = null
  if (status) await applyStatus(status)
}
</script>

<template>
  <PageFrame
    class="todo-view"
    :class="{ 'is-narrow-detail-open': narrowDetailOpen }"
    variant="workspace"
    data-test="todo-view"
  >
    <template #top>
      <PageTop>
        <PageHeader title="待办事项" :description="headerSummary">
          <template #icon><span class="todo-view__title-mark">✓</span></template>
          <template #actions>
            <StatusIndicator :label="globalStatus.label" :status="globalStatus.status" />
            <BaseButton
              variant="secondary"
              :disabled="completedCount === 0"
              @click="confirmClear = true"
            >清理已完成</BaseButton>
            <BaseButton @click="createOpen = true">＋ 新建待办</BaseButton>
          </template>
        </PageHeader>
      </PageTop>
    </template>

    <div class="todo-workspace">
      <TodoTaskList
        :todos="visibleTodos"
        :current-id="currentId"
        :search="search"
        :filter="filter"
        :active-count="activeCount"
        :done-count="completedCount"
        :list-state="listState"
        :list-error="listError"
        @select="handleSelect"
        @toggle-done="handleToggleDone"
        @retry="load(true)"
        @update:search="search = $event"
        @update:filter="filter = $event"
      />
      <TodoTaskDetail
        :todo="currentTodo"
        :narrow-detail-open="narrowDetailOpen"
        @update-field="updateCurrent"
        @update-checklist="updateChecklist"
        @add-checklist="addChecklist"
        @remove-checklist="removeChecklist"
        @request-status="requestStatus"
        @delete="confirmDelete = true"
        @back="narrowDetailOpen = false"
        @retry-save="retryCurrentSave"
      />
    </div>

    <TodoCreateDialog
      v-model="createOpen"
      :creating="creating"
      @submit="handleCreate"
    />
    <ConfirmDialog
      v-model="confirmDelete"
      title="删除这条任务？"
      message="任务、描述和子任务清单都会被永久删除。"
      confirm-text="删除任务"
      tone="danger"
      @confirm="handleDelete"
    />
    <ConfirmDialog
      v-model="confirmClear"
      :title="`清理 ${completedCount} 条已完成待办？`"
      :message="clearMessage"
      confirm-text="清理"
      tone="danger"
      @confirm="handleClear"
    />
    <ConfirmDialog
      v-model="confirmComplete"
      :title="`还有 ${incompleteChecklistCount} 个子任务未完成`"
      message="标记父任务完成会连同未完成的子任务一起完成。"
      confirm-text="一起完成"
      cancel-text="再想想"
      @confirm="confirmParentCompletion"
    />
  </PageFrame>
</template>
