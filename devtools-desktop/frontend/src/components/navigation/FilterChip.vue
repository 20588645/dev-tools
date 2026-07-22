<script setup lang="ts">
import { NTag } from 'naive-ui'

const props = withDefaults(defineProps<{
  label: string
  selected?: boolean
  count?: number
  removable?: boolean
  disabled?: boolean
}>(), { selected: false, count: undefined, removable: false, disabled: false })

const emit = defineEmits<{
  'update:selected': [value: boolean]
  remove: []
}>()

const filterChipThemeOverrides = {
  borderRadius: 'var(--radius-pill)',
  heightSmall: 'var(--component-control-height-sm)',
  fontSizeSmall: 'var(--font-size-xs)',
  fontWeightStrong: 'var(--font-weight-semibold)',
  padding: '0 var(--space-3)',
  border: '1px solid var(--component-control-border)',
  colorCheckable: 'transparent',
  colorHoverCheckable: 'color-mix(in srgb, var(--color-surface-raised) 80%, var(--color-action) 8%)',
  colorPressedCheckable: 'color-mix(in srgb, var(--color-surface-raised) 72%, var(--color-action) 12%)',
  colorChecked: 'color-mix(in srgb, var(--color-action) 12%, var(--color-surface))',
  colorCheckedHover: 'color-mix(in srgb, var(--color-action) 16%, var(--color-surface))',
  colorCheckedPressed: 'color-mix(in srgb, var(--color-action) 20%, var(--color-surface))',
  textColorCheckable: 'var(--color-text-muted)',
  textColorHoverCheckable: 'var(--color-text)',
  textColorPressedCheckable: 'var(--color-action)',
  textColorChecked: 'var(--color-action)',
  closeMargin: '0 0 0 var(--space-1)',
  closeIconColor: 'var(--color-text-subtle)',
  closeIconColorHover: 'var(--color-text)',
  closeIconColorPressed: 'var(--color-action)',
}
</script>

<template>
  <NTag
    class="filter-chip"
    checkable
    :checked="props.selected"
    :closable="removable"
    :disabled="disabled"
    size="small"
    round
    :theme-overrides="filterChipThemeOverrides"
    @update:checked="emit('update:selected', $event)"
    @close="emit('remove')"
  >
    {{ label }}<span v-if="count !== undefined" class="filter-chip__count">{{ count }}</span>
  </NTag>
</template>

<style scoped>
.filter-chip {
  min-height: var(--component-control-height-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.filter-chip:hover { border-color: var(--component-control-border-hover); }
.filter-chip:deep(.n-tag__content) { display: inline-flex; align-items: center; gap: var(--space-1); }
.filter-chip:deep(.n-tag__close) { width: 16px; height: 16px; margin-left: var(--space-1); border-radius: var(--radius-pill); }
.filter-chip__count { display: inline-flex; min-width: 16px; height: 16px; align-items: center; justify-content: center; padding: 0 5px; border-radius: var(--radius-pill); background: color-mix(in srgb, currentColor 14%, transparent); font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1; }
</style>
