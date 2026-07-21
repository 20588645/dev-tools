<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  compact?: boolean
}>(), { label: '正在加载…', compact: false })
</script>

<template>
  <div class="loading-state" :class="{ 'loading-state--compact': compact }" role="status" aria-live="polite">
    <span class="loading-state__spinner" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.loading-state { display: flex; align-items: center; justify-content: center; gap: var(--space-3); min-height: 160px; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.loading-state--compact { justify-content: flex-start; min-height: 40px; }
.loading-state__spinner { width: 18px; height: 18px; border: 2px solid var(--color-border-strong); border-top-color: var(--color-action); border-radius: var(--radius-pill); animation: loading-spin 700ms linear infinite; }
@keyframes loading-spin { to { transform: rotate(360deg); } }
</style>
