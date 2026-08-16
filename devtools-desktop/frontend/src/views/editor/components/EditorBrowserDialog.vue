<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import { formatEditorSize, type EditorBrowseEntry } from '@/services/modules/editor-service'
import { useEditorStore } from '@/stores/editor'
import { useNotificationStore } from '@/stores/notification'

const props = defineProps<{
  open: boolean
  mode: 'open' | 'save'
  defaultFilename?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  pick: [path: string]
  'save-as': [payload: { dir: string; filename: string }]
}>()

const store = useEditorStore()
const notify = useNotificationStore()
const filename = ref('')

const title = computed(() => (props.mode === 'save' ? '另存为' : '打开文件'))
const subtitle = computed(() => (
  props.mode === 'save'
    ? '选择保存目录，填写文件名后点保存'
    : '浏览目录，点击文件即可打开编辑'
))

watch(() => props.open, (open) => {
  if (!open) return
  filename.value = props.defaultFilename || ''
  void store.loadBrowse(store.browse?.currentDir)
})

const crumbs = computed(() => {
  const dir = store.browse?.currentDir || ''
  const parts = dir.split('/').filter(Boolean)
  const items: { label: string; path: string }[] = [{ label: '/', path: '/' }]
  let accum = ''
  for (const p of parts) {
    accum += `/${p}`
    items.push({ label: p, path: accum })
  }
  return items
})

function close() {
  emit('update:open', false)
}

function onEntry(entry: EditorBrowseEntry) {
  if (entry.isDir) {
    void store.loadBrowse(entry.path)
    return
  }
  if (props.mode === 'save') {
    filename.value = entry.name
    return
  }
  emit('pick', entry.path)
  close()
}

function confirmSave() {
  const name = filename.value.trim()
  const dir = store.browse?.currentDir
  if (!name) {
    notify.push('请填写文件名', 'warning')
    return
  }
  if (name.includes('/')) {
    notify.push('文件名不能包含 /', 'warning')
    return
  }
  if (!dir) {
    notify.push('请选择保存目录', 'warning')
    return
  }
  emit('save-as', { dir: dir.replace(/\/$/, ''), filename: name })
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    :title="title"
    :subtitle="subtitle"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="ed-browser">
      <div class="ed-browser__nav">
        <BaseButton variant="ghost" size="sm" @click="store.loadBrowse(store.browse?.home)">
          主目录
        </BaseButton>
        <BaseButton
          variant="ghost"
          size="sm"
          :disabled="!store.browse?.parent"
          @click="store.browse?.parent && store.loadBrowse(store.browse.parent)"
        >
          上一级
        </BaseButton>
      </div>
      <div class="browser-breadcrumb">
        <template v-for="(c, i) in crumbs" :key="c.path">
          <span v-if="i > 0">/</span>
          <span
            class="browser-breadcrumb__crumb"
            role="button"
            tabindex="0"
            @click="store.loadBrowse(c.path)"
            @keydown.enter="store.loadBrowse(c.path)"
          >{{ c.label }}</span>
        </template>
      </div>
      <div class="browser-list" :aria-busy="store.browseLoading">
        <div v-if="store.browseLoading" class="ed-browser__empty">加载中…</div>
        <div v-else-if="!store.browse?.entries.length" class="ed-browser__empty">此目录为空</div>
        <div
          v-for="entry in store.browse?.entries || []"
          :key="entry.path"
          class="browser-item"
          role="button"
          tabindex="0"
          @click="onEntry(entry)"
          @keydown.enter="onEntry(entry)"
        >
          <span class="browser-item__name">
            <span class="browser-item__kind" aria-hidden="true">{{ entry.isDir ? 'DIR' : 'FILE' }}</span>
            {{ entry.name }}
          </span>
          <span class="browser-item__meta">
            {{ entry.isDir ? '→' : formatEditorSize(entry.size || 0) }}
          </span>
        </div>
      </div>
      <div v-if="mode === 'save'" class="ed-browser__save-row">
        <span>文件名</span>
        <BaseInput
          v-model="filename"
          aria-label="文件名"
          placeholder="例如 notes.txt"
          @keydown.enter="confirmSave"
        />
        <BaseButton variant="primary" :disabled="!filename.trim()" @click="confirmSave">
          保存到此处
        </BaseButton>
      </div>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="close">取消</BaseButton>
    </template>
  </BaseDialog>
</template>
