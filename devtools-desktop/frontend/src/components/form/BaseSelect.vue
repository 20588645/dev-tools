<script setup lang="ts">
import { computed, useId } from 'vue'

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: string
  options: SelectOption[]
  id?: string
  label?: string
  placeholder?: string
  helpText?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>(), {
  modelValue: '',
  id: undefined,
  label: undefined,
  placeholder: undefined,
  helpText: undefined,
  error: undefined,
  disabled: false,
  required: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const selectId = computed(() => props.id ?? `base-select-${generatedId}`)
const messageId = computed(() => `${selectId.value}-message`)
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="selectId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <div class="field-control__select-wrap">
      <select
        :id="selectId"
        class="field-control__select"
        :class="{ 'field-control__select--error': error }"
        :value="modelValue"
        :disabled="disabled"
        :required="required"
        :aria-invalid="Boolean(error)"
        :aria-describedby="helpText || error ? messageId : undefined"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
      </select>
      <span class="field-control__select-chevron" aria-hidden="true" />
    </div>
    <p v-if="error || helpText" :id="messageId" class="field-control__message" :class="{ 'field-control__message--error': error }">
      {{ error || helpText }}
    </p>
  </div>
</template>

<style scoped>
.field-control { display: grid; gap: var(--space-2); min-width: 0; }
.field-control__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.field-control__label span { color: var(--color-danger); }
.field-control__select-wrap { position: relative; display: flex; align-items: center; min-height: var(--component-control-height-md); color: var(--color-text); background: var(--component-control-surface); border: 1px solid var(--component-control-border); border-radius: var(--component-control-radius); transition: border-color var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard); }
.field-control__select-wrap:hover { border-color: var(--component-control-border-hover); }
.field-control__select-wrap:focus-within { border-color: var(--component-control-border-focus); box-shadow: var(--component-control-focus-ring); }
.field-control__select { width: 100%; min-height: calc(var(--component-control-height-md) - 2px); padding: 0 var(--space-8) 0 var(--space-3); color: inherit; background: transparent; border: 0; outline: 0; appearance: none; font: inherit; cursor: pointer; }
.field-control__select--error { color: var(--color-danger); }
.field-control__select:disabled { cursor: not-allowed; }
.field-control__select-wrap:has(.field-control__select:disabled) { background: var(--color-surface-subtle); opacity: 0.65; }
.field-control__select-chevron { position: absolute; right: var(--space-3); width: 7px; height: 7px; pointer-events: none; border-right: 1.5px solid var(--color-text-muted); border-bottom: 1.5px solid var(--color-text-muted); transform: translateY(-2px) rotate(45deg); }
.field-control__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.field-control__message--error { color: var(--color-danger); }
</style>
