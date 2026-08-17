<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'

import type { NotebookDraft } from '../composables/useNotebook'
import { notebookSaveLabel } from '../composables/useNotebook'
import NotebookRichEditor, { type NotebookActiveFormats, type NotebookInlineFormat } from './NotebookRichEditor.vue'

const props = defineProps<{
  draft: NotebookDraft | null
  listCollapsed: boolean
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'update:content': [value: string]
  togglePin: []
  toggleList: []
  delete: []
  duplicate: []
  retryLoad: []
  retrySave: []
  save: []
}>()

const richEditor = ref<InstanceType<typeof NotebookRichEditor> | null>(null)
const titleInput = ref<HTMLElement | null>(null)
const linkDialogOpen = ref(false)
const linkLabel = ref('')
const linkUrl = ref('')
const linkError = ref('')

const saveStatus = computed(() => {
  if (!props.draft) return 'idle' as const
  if (props.draft.saveState === 'error' || props.draft.loadState === 'error') return 'offline' as const
  if (props.draft.saveState === 'dirty' || props.draft.saveState === 'saving') return 'checking' as const
  return 'online' as const
})

const characterCount = computed(() => {
  if (!props.draft) return 0
  const template = document.createElement('template')
  template.innerHTML = props.draft.content
  return (template.content.textContent ?? '').trim().length
})

function requestLink() {
  const context = richEditor.value?.selectedLinkContext()
  if (!context) return
  if (context.suggestedUrl) {
    richEditor.value?.applyLinkToSelection(context.suggestedUrl)
    return
  }
  linkLabel.value = context.text
  linkUrl.value = ''
  linkError.value = ''
  linkDialogOpen.value = true
}

/** 原型 .nb-toolbar：常驻格式工具栏；图标 + 快捷键提示，激活态跟选区走 */
const formatTools: Array<{ format: NotebookInlineFormat; label: string; shortcut?: string }> = [
  { format: 'bold', label: '加粗', shortcut: '⌘B' },
  { format: 'italic', label: '斜体', shortcut: '⌘I' },
  { format: 'underline', label: '下划线', shortcut: '⌘U' },
  { format: 'heading', label: '二级标题', shortcut: '⌘⌥2' },
  { format: 'bulletList', label: '无序列表' },
  { format: 'orderedList', label: '有序列表' },
]

const emptyFormats: NotebookActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  heading: false,
  bulletList: false,
  orderedList: false,
}

const formats = ref<NotebookActiveFormats>({ ...emptyFormats })
const activeFormats = computed(() => formats.value)

function onFormats(next: NotebookActiveFormats) {
  formats.value = next
}

function formatTitle(tool: (typeof formatTools)[number]) {
  return tool.shortcut ? `${tool.label} ${tool.shortcut}` : tool.label
}

function closeLinkDialog() {
  linkDialogOpen.value = false
  linkError.value = ''
}

function confirmLink() {
  const linked = richEditor.value?.applyLinkToSelection(linkUrl.value)
  if (!linked) {
    linkError.value = '请输入以 http:// 或 https:// 开头的有效网址'
    return
  }
  closeLinkDialog()
}

function handleEditorShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const meta = event.metaKey || event.ctrlKey
  if (!meta) return
  const typingInField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement

  if (event.key.toLowerCase() === 's' && !event.shiftKey && !event.altKey) {
    event.preventDefault()
    richEditor.value?.finishCredentialEditing()
    emit('save')
    return
  }
  if (typingInField) return
  if (event.key.toLowerCase() === 'k' && !event.shiftKey && !event.altKey) {
    event.preventDefault()
    requestLink()
    return
  }
  if (event.altKey && event.code === 'Digit2') {
    event.preventDefault()
    richEditor.value?.applyFormat('heading')
  }
}

async function focusTitle() {
  await nextTick()
  const input = titleInput.value?.querySelector<HTMLInputElement>('input')
  input?.focus()
}

onMounted(() => window.addEventListener('keydown', handleEditorShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEditorShortcut))

defineExpose({ focusTitle })
</script>

<template>
  <BaseCard
    class="notebook-editor-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    fill-height
  >
    <div v-if="!draft" class="notebook-editor-panel__empty">
      <EmptyState title="选择一篇笔记" description="从左侧列表选择内容，或新建一篇笔记开始记录" />
    </div>
    <template v-else>
      <header class="notebook-editor-panel__header">
        <div class="notebook-editor-context">
          <StatusIndicator :label="notebookSaveLabel(draft)" :status="saveStatus" />
        </div>
        <div class="notebook-editor-actions">
          <BaseButton variant="ghost" size="sm" @click="emit('toggleList')">
            {{ listCollapsed ? '展开列表' : '收起列表' }}
          </BaseButton>
          <BaseButton :variant="draft.pinned ? 'secondary' : 'ghost'" size="sm" @click="emit('togglePin')">
            {{ draft.pinned ? '已置顶' : '置顶' }}
          </BaseButton>
          <BaseButton variant="ghost" size="sm" @click="emit('duplicate')">副本</BaseButton>
          <BaseButton variant="ghost" size="sm" @click="emit('delete')">删除</BaseButton>
        </div>
      </header>

      <div v-if="draft.loadState === 'loading' && !draft.content" class="notebook-editor-panel__state">
        <LoadingState label="正在加载笔记内容…" />
      </div>
      <div v-else-if="draft.loadState === 'error' && !draft.content && !draft.title" class="notebook-editor-panel__state">
        <ErrorState title="笔记加载失败" :description="draft.loadError" @retry="emit('retryLoad')" />
      </div>
      <div v-else class="notebook-editor-panel__body">
        <div v-if="draft.loadState === 'error'" class="notebook-editor-inline-error" role="alert">
          <span>服务暂不可用，当前会话内容仍保留在页面中。</span>
          <BaseButton variant="ghost" size="sm" @click="emit('retryLoad')">重新加载</BaseButton>
        </div>
        <div v-if="draft.saveState === 'error'" class="notebook-editor-inline-error" role="alert">
          <span>{{ draft.saveError }}</span>
          <BaseButton variant="ghost" size="sm" @click="emit('retrySave')">重新保存</BaseButton>
        </div>
        <BaseInput
          ref="titleInput"
          class="notebook-editor-title"
          label="笔记标题"
          label-variant="eyebrow"
          variant="title"
          :model-value="draft.title"
          placeholder="无标题笔记"
          autocomplete="off"
          @update:model-value="emit('update:title', $event)"
        />
        <div
          class="notebook-format-toolbar"
          role="toolbar"
          aria-label="笔记格式工具栏"
          @pointerdown.capture="richEditor?.captureSelection()"
        >
          <BaseButton
            v-for="tool in formatTools"
            :key="tool.format"
            variant="ghost"
            size="sm"
            class="notebook-format-toolbar__tool"
            :class="[`is-${tool.format}`, { 'is-active': activeFormats[tool.format] }]"
            :aria-label="tool.label"
            :aria-pressed="activeFormats[tool.format]"
            :title="formatTitle(tool)"
            @click="richEditor?.applyFormat(tool.format)"
          >
            <svg v-if="tool.format === 'bold'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 5h7a3.5 3.5 0 0 1 0 7H7z" />
              <path d="M7 12h8a3.5 3.5 0 0 1 0 7H7z" />
            </svg>
            <svg v-else-if="tool.format === 'italic'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 5H9" /><path d="M15 19H9" /><path d="M14 5l-4 14" />
            </svg>
            <svg v-else-if="tool.format === 'underline'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 5v7a5 5 0 0 0 10 0V5" /><path d="M5 19h14" />
            </svg>
            <svg v-else-if="tool.format === 'heading'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 5v14" /><path d="M18 5v14" /><path d="M6 12h12" />
            </svg>
            <svg v-else-if="tool.format === 'bulletList'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" />
              <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" />
              <path d="M4 5.5v3" /><path d="M5.5 5.5v3" /><path d="M4 11.5h3l-3 4h3" />
            </svg>
          </BaseButton>
          <span class="notebook-format-toolbar__divider" aria-hidden="true" />
          <BaseButton variant="ghost" size="sm" class="notebook-format-toolbar__action" title="将选中文字设为链接 ⌘K" @click="requestLink">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.84" />
              <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.16" />
            </svg>
            链接
          </BaseButton>
          <BaseButton variant="ghost" size="sm" class="notebook-format-toolbar__action" title="插入凭据信息表，点格编辑，悬停复制" @click="richEditor?.insertCredential()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 10h18" /><path d="M9 10v10" />
            </svg>
            凭证表
          </BaseButton>
          <BaseButton variant="ghost" size="sm" class="notebook-format-toolbar__tool" title="统一整篇格式" aria-label="统一整篇格式" @click="richEditor?.normalizeDocument()">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" />
              <path d="M5.6 5.6l2.1 2.1" /><path d="M16.3 16.3l2.1 2.1" /><path d="M5.6 18.4l2.1-2.1" /><path d="M16.3 7.7l2.1-2.1" />
            </svg>
          </BaseButton>
        </div>
        <NotebookRichEditor
          ref="richEditor"
          :key="draft.id"
          :note-id="draft.id"
          :model-value="draft.content"
          @update:model-value="emit('update:content', $event)"
          @update:formats="onFormats"
        />
      </div>

      <footer class="notebook-editor-panel__footer">
        <div>
          <span>{{ characterCount }} 字</span>
          <span>停止输入后自动保存</span>
        </div>
        <span>链接 ⌘K · ⌘ 单击打开 · 悬停复制凭证 · ⌘⇧C</span>
      </footer>
    </template>
  </BaseCard>

  <BaseDialog v-model="linkDialogOpen" title="设置网页链接" size="compact">
    <div class="notebook-link-dialog">
      <p>将“{{ linkLabel }}”设置为可点击链接</p>
      <BaseInput
        v-model="linkUrl"
        type="url"
        label="跳转地址"
        placeholder="https://example.com"
        :error="linkError"
        @focus="linkError = ''"
      />
    </div>
    <template #footer>
      <div class="notebook-link-dialog__actions">
        <BaseButton variant="ghost" @click="closeLinkDialog">取消</BaseButton>
        <BaseButton @click="confirmLink">设为链接</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.notebook-link-dialog {
  display: grid;
  gap: var(--space-4);
}

.notebook-link-dialog p {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notebook-link-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
