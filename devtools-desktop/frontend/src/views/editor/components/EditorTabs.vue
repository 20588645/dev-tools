<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import type { EditorTabMeta } from '@/stores/editor'

defineProps<{
  tabs: EditorTabMeta[]
  active: string | null
}>()

const emit = defineEmits<{
  activate: [key: string]
  close: [key: string]
  create: []
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
      tabindex="0"
      :aria-selected="tab.key === active"
      :title="tab.isDraft ? tab.name : tab.path"
      @click="emit('activate', tab.key)"
      @keydown.enter.prevent="emit('activate', tab.key)"
      @keydown.space.prevent="emit('activate', tab.key)"
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
        @keydown.enter.stop.prevent="emit('close', tab.key)"
        @keydown.space.stop.prevent="emit('close', tab.key)"
      >
        <svg class="ed-tab-x" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    </div>
    <span class="ed-tab-add">
      <BaseIconButton
        label="新建草稿"
        size="sm"
        variant="ghost"
        @click="emit('create')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </BaseIconButton>
    </span>
  </div>
</template>
