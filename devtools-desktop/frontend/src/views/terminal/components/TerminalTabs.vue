<script setup lang="ts">
import type { TerminalTabMeta } from '@/stores/terminal'

defineProps<{
  tabs: TerminalTabMeta[]
  activeTabId: string | null
  canClose: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
  create: []
}>()
</script>

<template>
  <div class="term-tabs-wrapper">
    <div class="term-tabs" role="tablist">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="term-tab"
        :class="{ active: tab.id === activeTabId }"
        role="tab"
        :aria-selected="tab.id === activeTabId"
        @click="emit('activate', tab.id)"
      >
        <span class="term-tab__title">{{ tab.name }}</span>
        <span
          v-if="canClose"
          class="term-tab__close"
          role="button"
          tabindex="0"
          title="关闭"
          @click.stop="emit('close', tab.id)"
          @keydown.enter.stop="emit('close', tab.id)"
        >✕</span>
      </div>
    </div>
    <span
      class="term-add-tab"
      role="button"
      tabindex="0"
      title="新建标签页 (Cmd+T)"
      @click="emit('create')"
      @keydown.enter="emit('create')"
    >
      <svg class="term-action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  </div>
</template>
