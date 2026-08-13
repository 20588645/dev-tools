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

/* redesign-v2：浮层菜单 = 大投影 + 12px 圆角 + accent 淡底悬停（原型 ctx-menu 视觉） */
const dropdownThemeOverrides = {
  color: 'var(--color-surface-raised)',
  textColor: 'var(--color-text)',
  optionTextColorHover: 'var(--color-text)',
  optionTextColorActive: 'var(--color-action)',
  optionColorHover: 'var(--color-action-subtle)',
  optionColorActive: 'var(--color-action-subtle)',
  borderRadius: '12px',
  padding: 'var(--space-1)',
  optionHeight: 'var(--component-control-height-sm)',
  fontSize: 'var(--font-size-xs)',
  boxShadow: 'var(--shadow-lg)',
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
