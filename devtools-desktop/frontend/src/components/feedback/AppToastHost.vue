<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

import { useNotificationStore } from '@/stores/notification'

const notifications = useNotificationStore()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const schedule = () => {
  notifications.items.forEach((item) => {
    if (timers.has(item.id) || item.duration <= 0) return
    timers.set(item.id, globalThis.setTimeout(() => {
      notifications.remove(item.id)
      timers.delete(item.id)
    }, item.duration))
  })
}

watch(() => notifications.items, schedule, { deep: true, immediate: true })

onBeforeUnmount(() => {
  timers.forEach((timer) => globalThis.clearTimeout(timer))
  timers.clear()
})
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <div v-for="item in notifications.items" :key="item.id" class="toast" :class="`toast--${item.tone}`">
      <span class="toast__message">{{ item.message }}</span>
      <button type="button" aria-label="关闭通知" @click="notifications.remove(item.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; z-index: var(--z-toast); right: var(--space-4); bottom: var(--space-4); display: grid; gap: var(--space-2); width: min(360px, calc(100vw - var(--space-8))); }
.toast { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); color: var(--color-text); background: var(--color-surface-raised); border: 1px solid var(--color-border-strong); border-left: 3px solid var(--color-action); border-radius: var(--radius-md); box-shadow: var(--shadow-md); font-size: var(--font-size-sm); }
.toast--success { border-left-color: var(--color-success); }
.toast--warning { border-left-color: var(--color-warning); }
.toast--error { border-left-color: var(--color-danger); }
.toast button { flex: none; padding: 0; color: var(--color-text-muted); background: transparent; border: 0; cursor: pointer; font-size: var(--font-size-lg); line-height: 1; }
.toast button:hover { color: var(--color-text); }
</style>
