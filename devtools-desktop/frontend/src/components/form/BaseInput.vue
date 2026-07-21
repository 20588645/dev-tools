<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  id?: string
  label?: string
  type?: 'text' | 'search' | 'email' | 'url' | 'number' | 'password'
  placeholder?: string
  helpText?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
}>(), {
  modelValue: '',
  id: undefined,
  label: undefined,
  type: 'text',
  placeholder: undefined,
  helpText: undefined,
  error: undefined,
  disabled: false,
  readonly: false,
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const generatedId = useId()
const inputId = computed(() => props.id ?? `base-input-${generatedId}`)
const messageId = computed(() => `${inputId.value}-message`)
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="inputId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <div class="field-control__input-wrap">
      <span v-if="$slots.prefix" class="field-control__affix"><slot name="prefix" /></span>
      <input
        :id="inputId"
        class="field-control__input"
        :class="{ 'field-control__input--error': error }"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :aria-invalid="Boolean(error)"
        :aria-describedby="helpText || error ? messageId : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur', $event)"
        @focus="emit('focus', $event)"
      >
      <span v-if="$slots.suffix" class="field-control__affix"><slot name="suffix" /></span>
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
.field-control__input-wrap { display: flex; align-items: center; min-height: var(--component-control-height-md); color: var(--color-text); background: var(--component-control-surface); border: 1px solid var(--component-control-border); border-radius: var(--component-control-radius); transition: border-color var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard), background var(--duration-normal) var(--ease-standard); }
.field-control__input-wrap:hover { border-color: var(--component-control-border-hover); }
.field-control__input-wrap:focus-within { border-color: var(--component-control-border-focus); box-shadow: var(--component-control-focus-ring); }
.field-control__input-wrap:has(.field-control__input:disabled) { background: var(--color-surface-subtle); opacity: 0.65; }
.field-control__input { flex: 1; min-width: 0; height: calc(var(--component-control-height-md) - 2px); padding: 0 var(--space-3); color: inherit; background: transparent; border: 0; outline: 0; font: inherit; }
.field-control__input::placeholder { color: var(--color-text-subtle); }
.field-control__input--error { color: var(--color-danger); }
.field-control__affix { display: inline-flex; flex: none; align-items: center; padding: 0 var(--space-3); color: var(--color-text-muted); }
.field-control__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.field-control__message--error { color: var(--color-danger); }
</style>
