<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import { useFileTransferStore } from '@/stores/file-transfer'

const store = useFileTransferStore()

function onClose(event: MouseEvent, id: number) {
  event.stopPropagation()
  void store.closeTab(id)
}
</script>

<template>
  <div class="ft-tabs" :class="{ 'has-tabs': store.tabs.length > 0 }">
    <div
      v-for="tab in store.tabs"
      :key="tab.id"
      class="ft-tab"
      :class="{ 'is-active': tab.id === store.activeTabId }"
      :title="`${tab.server.name || tab.server.host}${tab.server.host ? ` · ${tab.server.host}` : ''}`"
      @click="store.switchTab(tab.id)"
    >
      <span class="ft-tab-name">{{ tab.server.name || tab.server.host || '连接' }}</span>
      <BaseIconButton
        label="断开此连接"
        size="sm"
        variant="ghost"
        @click="onClose($event, tab.id)"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </BaseIconButton>
    </div>
  </div>
</template>
