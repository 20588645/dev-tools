<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import BaseSegmented from '@/components/navigation/BaseSegmented.vue'
import type { TodoCreateInput, TodoStatus } from '@/services/modules/todo-service'
import { useNotificationStore } from '@/stores/notification'

import TodoCreateDialog from './components/TodoCreateDialog.vue'
import TodoTaskDetail from './components/TodoTaskDetail.vue'
import TodoTaskList from './components/TodoTaskList.vue'
import { useTodo, type TodoFilter } from './composables/useTodo'
import './todo.css'

defineOptions({ name: 'TodoView' })

const {
  visibleTodos,
  groups,
  currentId,
  currentTodo,
  search,
  filter,
  collapsed,
  listState,
  listError,
  completedCount,
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
  toggleGroup,
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

const filterOptions = [
  { label: '全部', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '已逾期', value: 'overdue' },
]

const clearMessage = computed(() => `将永久删除 ${completedCount.value} 条已完成任务，此操作无法撤销。`)

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
    notifications.push('任务已创建', 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '创建任务失败', 'error')
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
    notifications.push(`已清除 ${deleted} 条完成任务`, 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '清除完成任务失败', 'error')
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
        <PageHeader title="待办事项" description="按状态管理个人任务">
          <template #icon><span class="todo-view__title-mark">✓</span></template>
          <template #actions>
            <StatusIndicator :label="globalStatus.label" :status="globalStatus.status" />
            <BaseButton @click="createOpen = true">＋ 新建任务</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="todo-toolbar">
            <div class="todo-toolbar__query">
              <BaseInput
                v-model="search"
                class="todo-toolbar__search"
                type="search"
                placeholder="搜索任务、描述或清单"
                aria-label="搜索待办任务"
              >
                <template #prefix><span aria-hidden="true">⌕</span></template>
              </BaseInput>
              <BaseSegmented
                :model-value="filter"
                :options="filterOptions"
                aria-label="任务筛选"
                @update:model-value="filter = $event as TodoFilter"
              />
            </div>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="completedCount === 0"
              @click="confirmClear = true"
            >清除已完成</BaseButton>
          </div>
        </PageToolbar>
      </PageTop>
    </template>

    <div class="todo-workspace">
      <TodoTaskList
        :groups="groups"
        :current-id="currentId"
        :collapsed="collapsed"
        :visible-count="visibleTodos.length"
        :list-state="listState"
        :list-error="listError"
        @select="handleSelect"
        @toggle-group="toggleGroup"
        @retry="load(true)"
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
      title="清除全部已完成任务？"
      :message="clearMessage"
      confirm-text="全部清除"
      tone="danger"
      @confirm="handleClear"
    />
    <ConfirmDialog
      v-model="confirmComplete"
      title="仍有子任务未完成"
      message="将父任务标记为完成时，是否同时完成剩余子任务？"
      confirm-text="全部完成"
      @confirm="confirmParentCompletion"
    />
  </PageFrame>
</template>
