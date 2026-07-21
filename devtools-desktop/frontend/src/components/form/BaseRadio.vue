<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  value: string
  name: string
  id?: string
  label: string
  description?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  id: undefined,
  description: undefined,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-radio-${generatedId}`)
</script>

<template>
  <label class="choice-control" :class="{ 'choice-control--disabled': disabled }" :for="inputId">
    <input :id="inputId" type="radio" :name="name" :value="value" :checked="modelValue === value" :disabled="disabled" @change="emit('update:modelValue', value)">
    <span class="choice-control__radio" aria-hidden="true"><span /></span>
    <span class="choice-control__copy">
      <span class="choice-control__label">{{ label }}</span>
      <span v-if="description" class="choice-control__description">{{ description }}</span>
    </span>
  </label>
</template>

<style scoped>
.choice-control { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--color-text); cursor: pointer; }
.choice-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.choice-control__radio { display: grid; flex: none; width: 18px; height: 18px; place-items: center; margin-top: 1px; background: transparent; border: 1px solid var(--color-border-strong); border-radius: var(--radius-pill); transition: border-color var(--duration-normal) var(--ease-standard); }
.choice-control__radio span { width: 8px; height: 8px; background: var(--color-action); border-radius: var(--radius-pill); opacity: 0; }
.choice-control input:checked + .choice-control__radio { border-color: var(--color-action); }
.choice-control input:checked + .choice-control__radio span { opacity: 1; }
.choice-control input:focus-visible + .choice-control__radio { box-shadow: var(--component-focus-outline); }
.choice-control--disabled { cursor: not-allowed; opacity: 0.55; }
.choice-control__copy { display: grid; gap: 2px; }
.choice-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.choice-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
</style>
