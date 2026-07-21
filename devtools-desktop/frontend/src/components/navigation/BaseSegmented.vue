<script setup lang="ts">
export interface SegmentOption {
  label: string
  value: string
  disabled?: boolean
}

withDefaults(defineProps<{
  modelValue: string
  options: SegmentOption[]
  ariaLabel?: string
}>(), { ariaLabel: '分段选择' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="base-segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      class="base-segmented__option"
      :class="{ 'base-segmented__option--active': modelValue === option.value }"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="option.disabled"
      @click="emit('update:modelValue', option.value)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
.base-segmented { display: inline-flex; max-width: 100%; padding: 3px; overflow-x: auto; background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--component-control-radius); }
.base-segmented__option { min-height: calc(var(--component-control-height-sm) - 4px); padding: 0 var(--space-3); color: var(--color-text-muted); background: transparent; border: 0; border-radius: var(--radius-sm); cursor: pointer; font: inherit; font-size: var(--font-size-sm); white-space: nowrap; }
.base-segmented__option--active { color: var(--color-text); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.base-segmented__option:hover:not(:disabled) { color: var(--color-text); }
.base-segmented__option:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.base-segmented__option:disabled { cursor: not-allowed; opacity: 0.45; }
</style>
