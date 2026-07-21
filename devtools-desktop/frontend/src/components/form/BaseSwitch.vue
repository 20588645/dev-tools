<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  id?: string
  label: string
  description?: string
  disabled?: boolean
}>(), {
  modelValue: false,
  id: undefined,
  description: undefined,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-switch-${generatedId}`)
</script>

<template>
  <label class="switch-control" :class="{ 'switch-control--disabled': disabled }" :for="inputId">
    <span class="switch-control__copy">
      <span class="switch-control__label">{{ label }}</span>
      <span v-if="description" class="switch-control__description">{{ description }}</span>
    </span>
    <input :id="inputId" type="checkbox" role="switch" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
    <span class="switch-control__track" aria-hidden="true"><span /></span>
  </label>
</template>

<style scoped>
.switch-control { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); color: var(--color-text); cursor: pointer; }
.switch-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.switch-control__copy { display: grid; gap: 2px; }
.switch-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.switch-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.switch-control__track { display: flex; flex: none; align-items: center; width: 36px; height: 20px; padding: 2px; background: var(--color-border-strong); border-radius: var(--radius-pill); transition: background var(--duration-normal) var(--ease-standard); }
.switch-control__track span { width: 16px; height: 16px; background: var(--color-surface); border-radius: var(--radius-pill); box-shadow: var(--shadow-sm); transition: transform var(--duration-normal) var(--ease-standard); }
.switch-control input:checked + .switch-control__track { background: var(--color-action); }
.switch-control input:checked + .switch-control__track span { transform: translateX(16px); }
.switch-control input:focus-visible + .switch-control__track { box-shadow: var(--component-focus-outline); }
.switch-control--disabled { cursor: not-allowed; opacity: 0.55; }
</style>
