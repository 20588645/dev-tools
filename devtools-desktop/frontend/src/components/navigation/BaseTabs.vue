<script setup lang="ts">
import { computed } from 'vue'

export interface TabItem {
  label: string
  value: string
  disabled?: boolean
  badge?: string | number
}

const props = withDefaults(defineProps<{
  modelValue: string
  items: TabItem[]
  ariaLabel?: string
}>(), {
  ariaLabel: '页面标签',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const enabledItems = computed(() => props.items.filter((item) => !item.disabled))

const select = (value: string) => {
  const item = props.items.find((candidate) => candidate.value === value)
  if (item && !item.disabled) emit('update:modelValue', value)
}

const move = (current: string, direction: 1 | -1) => {
  if (enabledItems.value.length === 0) return
  const index = enabledItems.value.findIndex((item) => item.value === current)
  const nextIndex = (index + direction + enabledItems.value.length) % enabledItems.value.length
  select(enabledItems.value[nextIndex].value)
}
</script>

<template>
  <div class="base-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="item in items"
      :key="item.value"
      class="base-tabs__tab"
      :class="{ 'base-tabs__tab--active': modelValue === item.value }"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.value"
      :aria-disabled="item.disabled || undefined"
      :tabindex="modelValue === item.value ? 0 : -1"
      :disabled="item.disabled"
      @click="select(item.value)"
      @keydown.right.prevent="move(item.value, 1)"
      @keydown.left.prevent="move(item.value, -1)"
      @keydown.home.prevent="select(enabledItems[0]?.value ?? modelValue)"
      @keydown.end.prevent="select(enabledItems[enabledItems.length - 1]?.value ?? modelValue)"
    >
      <span>{{ item.label }}</span>
      <span v-if="item.badge !== undefined" class="base-tabs__badge">{{ item.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.base-tabs { display: flex; gap: var(--space-1); overflow-x: auto; scrollbar-width: thin; }
.base-tabs__tab { display: inline-flex; flex: none; align-items: center; gap: var(--space-2); min-height: var(--component-control-height-sm); padding: 0 var(--space-3); color: var(--color-text-muted); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; font: inherit; font-size: var(--font-size-sm); white-space: nowrap; }
.base-tabs__tab:hover:not(:disabled) { color: var(--color-text); background: var(--color-surface-subtle); }
.base-tabs__tab--active { color: var(--color-action); background: var(--color-surface-subtle); border-color: var(--color-border); }
.base-tabs__tab:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.base-tabs__tab:disabled { cursor: not-allowed; opacity: 0.45; }
.base-tabs__badge { display: inline-flex; min-width: 18px; min-height: 18px; align-items: center; justify-content: center; padding: 0 5px; color: inherit; background: color-mix(in srgb, currentColor 14%, transparent); border-radius: var(--radius-pill); font-size: var(--font-size-xs); }
</style>
