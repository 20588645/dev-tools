<script setup lang="ts">
import type { EditorSaveStatus, EditorTabMeta } from '@/stores/editor'
import { edLangLabelForExt } from '@/views/editor/editor-modes'

defineProps<{
  tab: EditorTabMeta | null
  cursorLine: number
  cursorCol: number
  saveStatus: EditorSaveStatus
}>()

function pathLabel(tab: EditorTabMeta) {
  if (!tab.isDraft) return tab.path
  return `${tab.name}${tab.draftId ? '（草稿·已存）' : '（草稿·未存）'}`
}

function saveLabel(status: EditorSaveStatus) {
  switch (status) {
    case 'dirty': return '未保存'
    case 'saving': return '保存中'
    case 'saved': return '已保存'
    case 'latest': return '已是最新'
    case 'error': return '保存失败'
    default: return ''
  }
}

function saveTone(status: EditorSaveStatus) {
  if (status === 'dirty' || status === 'saving') return 'warning'
  if (status === 'error') return 'danger'
  if (status === 'saved' || status === 'latest') return 'success'
  return ''
}
</script>

<template>
  <div v-if="tab" class="ed-statusbar">
    <span class="ed-status-path">{{ pathLabel(tab) }}</span>
    <span class="ed-status-spacer" />
    <span class="ed-status-item">行 {{ cursorLine }}, 列 {{ cursorCol }}</span>
    <span class="ed-status-item">{{ edLangLabelForExt(tab.ext) }}</span>
    <span class="ed-status-item">{{ tab.eol }}</span>
    <span class="ed-status-item">
      <span
        v-if="saveStatus !== 'idle'"
        class="save-dot"
        :class="[saveTone(saveStatus), { loading: saveStatus === 'saving' }]"
      />
      {{ saveLabel(saveStatus) }}
    </span>
  </div>
</template>
