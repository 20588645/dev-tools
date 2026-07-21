<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), { title: '暂无内容', description: undefined })
</script>

<template>
  <div class="empty-state">
    <div v-if="$slots.icon" class="empty-state__icon" aria-hidden="true"><slot name="icon" /></div>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions" class="empty-state__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.empty-state { display: grid; justify-items: center; gap: var(--space-2); min-height: 160px; padding: var(--space-8); text-align: center; color: var(--color-text-muted); }
.empty-state__icon { display: grid; width: 40px; height: 40px; place-items: center; color: var(--color-action); background: var(--color-surface-subtle); border-radius: var(--radius-lg); }
h2 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
p { max-width: 420px; margin: 0; font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.empty-state__actions { margin-top: var(--space-2); }
</style>
