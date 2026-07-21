<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  selected?: boolean
  count?: number
  removable?: boolean
  disabled?: boolean
}>(), {
  selected: false,
  count: undefined,
  removable: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:selected': [value: boolean]
  remove: []
}>()
</script>

<template>
  <span class="filter-chip" :class="{ 'filter-chip--selected': selected, 'filter-chip--disabled': disabled }">
    <button class="filter-chip__main" type="button" :disabled="disabled" :aria-pressed="selected" @click="emit('update:selected', !selected)">
      <span>{{ label }}</span>
      <span v-if="count !== undefined" class="filter-chip__count">{{ count }}</span>
    </button>
    <button v-if="removable" class="filter-chip__remove" type="button" :disabled="disabled" aria-label="移除筛选" @click="emit('remove')">×</button>
  </span>
</template>

<style scoped>
.filter-chip { display: inline-flex; align-items: center; overflow: hidden; color: var(--color-text-muted); background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-pill); font-size: var(--font-size-xs); }
.filter-chip--selected { color: var(--color-action); background: color-mix(in srgb, var(--color-action) 12%, transparent); border-color: color-mix(in srgb, var(--color-action) 48%, var(--color-border)); }
.filter-chip__main, .filter-chip__remove { min-height: 26px; color: inherit; background: transparent; border: 0; cursor: pointer; font: inherit; }
.filter-chip__main { display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); }
.filter-chip__count { display: inline-flex; min-width: 16px; min-height: 16px; align-items: center; justify-content: center; padding: 0 4px; color: inherit; background: color-mix(in srgb, currentColor 14%, transparent); border-radius: var(--radius-pill); }
.filter-chip__remove { width: 26px; padding: 0; border-left: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
.filter-chip__main:hover:not(:disabled), .filter-chip__remove:hover:not(:disabled) { color: var(--color-text); background: var(--color-surface-subtle); }
.filter-chip__main:focus-visible, .filter-chip__remove:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.filter-chip--disabled { cursor: not-allowed; opacity: 0.45; }
</style>
