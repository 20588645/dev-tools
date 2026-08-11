<script setup lang="ts">
import type { EditorTabMeta } from '@/stores/editor'

defineProps<{
  tabs: EditorTabMeta[]
  active: string | null
}>()

const emit = defineEmits<{
  activate: [key: string]
  close: [key: string]
  contextmenu: [payload: { key: string; event: MouseEvent }]
}>()
</script>

<template>
  <div class="ed-tabs" role="tablist">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      class="ed-tab"
      :class="{ active: tab.key === active }"
      role="tab"
      :aria-selected="tab.key === active"
      :title="tab.isDraft ? tab.name : tab.path"
      @click="emit('activate', tab.key)"
      @contextmenu.prevent="emit('contextmenu', { key: tab.key, event: $event })"
    >
      <span class="ed-tab-name">{{ tab.name }}</span>
      <span
        class="ed-tab-close"
        :class="{ dirty: tab.dirty }"
        role="button"
        tabindex="0"
        :title="tab.dirty ? '未保存' : '关闭'"
        @click.stop="emit('close', tab.key)"
        @keydown.enter.stop="emit('close', tab.key)"
      >
        <svg class="ed-tab-x" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    </div>
  </div>
</template>
