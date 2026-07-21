<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  status?: 'online' | 'offline' | 'checking' | 'idle'
}>(), { status: 'idle' })
</script>

<template>
  <span class="status-indicator" :class="`status-indicator--${status}`">
    <span class="status-indicator__dot" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.status-indicator { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-sm); }
.status-indicator__dot { width: 7px; height: 7px; background: var(--color-text-subtle); border-radius: var(--radius-pill); }
.status-indicator--online .status-indicator__dot { background: var(--color-success); }
.status-indicator--offline .status-indicator__dot { background: var(--color-danger); }
.status-indicator--checking .status-indicator__dot { background: var(--color-warning); animation: status-pulse 1.2s ease-in-out infinite; }
@keyframes status-pulse { 50% { opacity: 0.35; } }
</style>
