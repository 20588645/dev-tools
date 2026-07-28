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
import BaseDropdownMenu from '@/components/overlay/BaseDropdownMenu.vue'

import type { NotebookDraft } from '../composables/useNotebook'
import { notebookSaveLabel } from '../composables/useNotebook'
import NotebookRichEditor from './NotebookRichEditor.vue'

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

const moreOptions = computed(() => [
  { label: '文本对齐（⌘⇧L）', key: 'align' },
  { label: '统一整篇格式', key: 'normalize' },
  { label: '将选中文字设为链接', key: 'link' },
  { label: '插入凭据信息表', key: 'credential' },
  { label: '复制正文', key: 'copy' },
  { label: '创建副本', key: 'duplicate' },
  { label: '删除笔记', key: 'delete' },
])

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

async function handleMoreAction(key: string) {
  if (key === 'align') richEditor.value?.alignSelection()
  if (key === 'normalize') richEditor.value?.normalizeDocument()
  if (key === 'link') {
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
  if (key === 'credential') richEditor.value?.insertCredential()
  if (key === 'copy') await richEditor.value?.copyDocument()
  if (key === 'duplicate') emit('duplicate')
  if (key === 'delete') emit('delete')
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

function handleSaveShortcut(event: KeyboardEvent) {
  if (
    event.defaultPrevented
    || (!event.metaKey && !event.ctrlKey)
    || event.shiftKey
    || event.key.toLowerCase() !== 's'
  ) return
  event.preventDefault()
  richEditor.value?.finishCredentialEditing()
  emit('save')
}

async function focusTitle() {
  await nextTick()
  const input = titleInput.value?.querySelector<HTMLInputElement>('input')
  input?.focus()
}

onMounted(() => window.addEventListener('keydown', handleSaveShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleSaveShortcut))

defineExpose({ focusTitle })
</script>

<template>
  <BaseCard class="notebook-editor-panel" content-padding="0">
    <div v-if="!draft" class="notebook-editor-panel__empty">
      <EmptyState title="选择一篇笔记" description="从左侧列表选择内容，或新建一篇笔记开始记录" />
    </div>
    <template v-else>
      <header class="notebook-editor-panel__header">
        <div class="notebook-editor-context">
          <StatusIndicator :label="notebookSaveLabel(draft)" :status="saveStatus" />
          <span>{{ draft.updatedAt ? '本地 SQLite' : '新建笔记' }}</span>
        </div>
        <div class="notebook-editor-actions">
          <BaseButton variant="ghost" size="sm" @click="emit('toggleList')">
            {{ listCollapsed ? '展开列表' : '收起列表' }}
          </BaseButton>
          <BaseButton :variant="draft.pinned ? 'secondary' : 'ghost'" size="sm" @click="emit('togglePin')">
            {{ draft.pinned ? '已置顶' : '置顶' }}
          </BaseButton>
          <span
            class="notebook-more-menu-trigger"
            @pointerdown.capture="richEditor?.captureSelection()"
          >
            <BaseDropdownMenu :options="moreOptions" @select="handleMoreAction">
              <BaseButton variant="ghost" size="sm" aria-label="更多笔记操作">更多</BaseButton>
            </BaseDropdownMenu>
          </span>
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
          :model-value="draft.title"
          placeholder="无标题笔记"
          autocomplete="off"
          @update:model-value="emit('update:title', $event)"
        />
        <NotebookRichEditor
          ref="richEditor"
          :key="draft.id"
          :note-id="draft.id"
          :model-value="draft.content"
          @update:model-value="emit('update:content', $event)"
        />
      </div>

      <footer class="notebook-editor-panel__footer">
        <div>
          <span>{{ characterCount }} 字</span>
          <span>停止输入 800ms 后自动保存</span>
        </div>
        <span>选中文字可设为链接 · ⌘ 单击打开</span>
      </footer>
    </template>
  </BaseCard>

  <BaseDialog v-model="linkDialogOpen" title="设置网页链接" width="420px">
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
