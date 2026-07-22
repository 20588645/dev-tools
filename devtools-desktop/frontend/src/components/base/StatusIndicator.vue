<script setup lang="ts">
import { computed } from 'vue'
import { NBadge } from 'naive-ui'

const props = withDefaults(defineProps<{
  label: string
  status?: 'online' | 'offline' | 'checking' | 'idle'
}>(), { status: 'idle' })

const statusTypes: Record<NonNullable<typeof props.status>, 'success' | 'error' | 'warning' | 'default'> = {
  online: 'success',
  offline: 'error',
  checking: 'warning',
  idle: 'default',
}
const type = computed(() => statusTypes[props.status])
</script>

<template>
  <span class="status-indicator" :class="`status-indicator--${status}`">
    <NBadge :type="type" dot :processing="status === 'checking'" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.status-indicator { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-sm); }
</style>
