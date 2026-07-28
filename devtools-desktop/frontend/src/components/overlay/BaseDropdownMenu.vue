<script setup lang="ts">
import { NDropdown, type DropdownOption as NaiveDropdownOption } from 'naive-ui'

export interface DropdownMenuOption {
  label: string
  key: string
  disabled?: boolean
}

defineProps<{
  options: DropdownMenuOption[]
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const dropdownThemeOverrides = {
  color: 'var(--color-surface-raised)',
  textColor: 'var(--color-text-muted)',
  optionTextColorHover: 'var(--color-text)',
  optionTextColorActive: 'var(--color-action)',
  optionColorHover: 'color-mix(in srgb, var(--color-action) 9%, transparent)',
  optionColorActive: 'color-mix(in srgb, var(--color-action) 12%, transparent)',
  borderRadius: 'var(--component-control-radius)',
  padding: 'var(--space-1)',
  optionHeight: 'var(--component-control-height-sm)',
  fontSize: 'var(--font-size-xs)',
  boxShadow: 'var(--shadow-md)',
}
</script>

<template>
  <NDropdown
    trigger="click"
    :options="options as NaiveDropdownOption[]"
    :theme-overrides="dropdownThemeOverrides"
    @select="emit('select', String($event))"
  >
    <slot />
  </NDropdown>
</template>
