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
const inputId = computed(() => props.id ?? `base-checkbox-${generatedId}`)
</script>

<template>
  <label class="choice-control" :class="{ 'choice-control--disabled': disabled }" :for="inputId">
    <input :id="inputId" type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
    <span class="choice-control__box" aria-hidden="true"><span>✓</span></span>
    <span class="choice-control__copy">
      <span class="choice-control__label">{{ label }}</span>
      <span v-if="description" class="choice-control__description">{{ description }}</span>
    </span>
  </label>
</template>

<style scoped>
.choice-control { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--color-text); cursor: pointer; }
.choice-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.choice-control__box { display: grid; flex: none; width: 18px; height: 18px; place-items: center; margin-top: 1px; color: var(--color-action-contrast); background: transparent; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); transition: background var(--duration-normal) var(--ease-standard), border-color var(--duration-normal) var(--ease-standard); }
.choice-control__box span { opacity: 0; font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); }
.choice-control input:checked + .choice-control__box { background: var(--color-action); border-color: var(--color-action); }
.choice-control input:checked + .choice-control__box span { opacity: 1; }
.choice-control input:focus-visible + .choice-control__box { box-shadow: var(--component-focus-outline); }
.choice-control--disabled { cursor: not-allowed; opacity: 0.55; }
.choice-control__copy { display: grid; gap: 2px; }
.choice-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.choice-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
</style>
