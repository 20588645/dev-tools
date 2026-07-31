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
