<script setup lang="ts">
import { nextTick, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { useNotificationStore } from '@/stores/notification'

import NotebookEditor from './components/NotebookEditor.vue'
import NotebookSidebar from './components/NotebookSidebar.vue'
import { useNotebook } from './composables/useNotebook'
import './notebook.css'

defineOptions({ name: 'NotebookView' })

const {
  notes,
  visibleNotes,
  currentId,
  currentDraft,
  search,
  appliedSearch,
  filter,
  sort,
  listState,
  listError,
  globalStatus,
  loadList,
  selectNote,
  createNote,
  duplicateCurrent,
  removeCurrent,
  updateCurrent,
  togglePin,
  moveNote,
  retryCurrentLoad,
  retryCurrentSave,
  flushCurrent,
} = useNotebook()

const notifications = useNotificationStore()
const editor = ref<InstanceType<typeof NotebookEditor> | null>(null)
const listCollapsed = ref(false)
const confirmDelete = ref(false)

async function handleCreate() {
  try {
    await createNote()
    await nextTick()
    editor.value?.focusTitle()
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '新建笔记失败', 'error')
  }
}

async function handleDuplicate() {
  try {
    await duplicateCurrent()
    notifications.push('已创建笔记副本', 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '创建副本失败', 'error')
  }
}

async function handleDelete() {
  try {
    await removeCurrent()
    confirmDelete.value = false
    notifications.push('笔记已删除', 'success')
  } catch (reason) {
    notifications.push(reason instanceof Error ? reason.message : '删除笔记失败', 'error')
  }
}

async function handleManualSave() {
  await flushCurrent()
  if (currentDraft.value?.saveState === 'saved') {
    notifications.push('笔记已保存', 'success')
  }
}
</script>

<template>
  <PageFrame class="notebook-view" variant="workspace" data-test="notebook-view">
    <template #top>
      <PageTop>
        <PageHeader title="个人笔记" description="轻量记录、账号信息与常用链接都保存在本机">
          <template #icon><span class="notebook-view__title-mark">N</span></template>
          <template #actions>
            <StatusIndicator :label="globalStatus.label" :status="globalStatus.status" />
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="notebook-toolbar">
            <BaseInput
              v-model="search"
              class="notebook-toolbar__search"
              type="search"
              variant="search"
              placeholder="搜索标题或正文…"
              aria-label="搜索个人笔记"
            >
              <template #prefix><span aria-hidden="true">⌕</span></template>
            </BaseInput>
            <div class="notebook-toolbar__actions">
              <span v-if="appliedSearch" class="notebook-toolbar__result">
                “{{ appliedSearch }}” · {{ visibleNotes.length }} 项
              </span>
              <BaseButton variant="primary" @click="handleCreate">＋ 新建笔记</BaseButton>
            </div>
          </div>
        </PageToolbar>
      </PageTop>
    </template>

    <div class="notebook-workspace" :class="{ 'is-list-collapsed': listCollapsed }">
      <NotebookSidebar
        v-if="!listCollapsed"
        :notes="visibleNotes"
        :current-id="currentId"
        :total-count="notes.length"
        :applied-search="appliedSearch"
        :filter="filter"
        :sort="sort"
        :list-state="listState"
        :list-error="listError"
        @select="selectNote"
        @retry="loadList(true)"
        @update:filter="filter = $event"
        @update:sort="sort = $event"
        @move="moveNote"
      />
      <NotebookEditor
        ref="editor"
        :draft="currentDraft"
        :list-collapsed="listCollapsed"
        @update:title="updateCurrent('title', $event)"
        @update:content="updateCurrent('content', $event)"
        @toggle-pin="togglePin"
        @toggle-list="listCollapsed = !listCollapsed"
        @delete="confirmDelete = true"
        @duplicate="handleDuplicate"
        @retry-load="retryCurrentLoad"
        @retry-save="retryCurrentSave"
        @save="handleManualSave"
      />
    </div>

    <ConfirmDialog
      v-model="confirmDelete"
      title="删除这篇笔记？"
      message="删除后无法恢复，笔记中的正文和凭据信息都会一并移除。"
      confirm-text="删除笔记"
      tone="danger"
      @confirm="handleDelete"
    />
  </PageFrame>
</template>
