<script setup lang="ts">
import { useMessage } from 'naive-ui'
import { onBeforeUnmount, watch } from 'vue'

import { createNotificationMessageBridge } from '@/adapters/notification-message'
import { useNotificationStore } from '@/stores/notification'

const notifications = useNotificationStore()
const bridge = createNotificationMessageBridge(useMessage(), (id) => notifications.remove(id))

watch(() => notifications.items, bridge.sync, { deep: true, immediate: true })
onBeforeUnmount(bridge.dispose)
</script>

<template>
  <div class="app-toast-host__announcer" aria-live="polite" aria-atomic="false">
    <span v-for="item in notifications.items" :key="item.id">{{ item.message }}</span>
  </div>
</template>

<style scoped>
.app-toast-host__announcer {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>

<style>
/* redesign-v2 方案 B：毛玻璃 Toast（Naive message 渲染在 Provider 容器下，组件自有全局规则接管） */
.app-toast-container .n-message {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-glass-strong);
  backdrop-filter: var(--component-glass-blur-soft);
  -webkit-backdrop-filter: var(--component-glass-blur-soft);
  box-shadow: var(--shadow-lg);
  font-weight: var(--font-weight-medium);
}
</style>
