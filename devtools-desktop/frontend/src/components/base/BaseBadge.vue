<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}>(), { tone: 'neutral' })
</script>

<template>
  <span class="base-badge" :class="`base-badge--${tone}`"><slot /></span>
</template>

<style scoped>
.base-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: 1;
}

.base-badge--neutral { color: var(--color-text-muted); background: var(--color-surface-subtle); }
.base-badge--info { color: var(--color-info); background: color-mix(in srgb, var(--color-info) 14%, transparent); }
.base-badge--success { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 14%, transparent); }
.base-badge--warning { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
.base-badge--danger { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 14%, transparent); }
</style>
