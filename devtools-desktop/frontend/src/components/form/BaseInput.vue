<script setup lang="ts">
import { computed, useId } from 'vue'
import { NInput } from 'naive-ui'

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
  modelValue: '', id: undefined, label: undefined, type: 'text', placeholder: undefined,
  helpText: undefined, error: undefined, disabled: false, readonly: false, required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const generatedId = useId()
const inputId = computed(() => props.id ?? `base-input-${generatedId}`)
const messageId = computed(() => `${inputId.value}-message`)
const inputType = computed<'text' | 'password'>(() => props.type === 'password' ? 'password' : 'text')
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="inputId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NInput
      :id="inputId"
      :value="String(modelValue ?? '')"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :status="error ? 'error' : undefined"
      :aria-required="required || undefined"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      :input-props="{ id: inputId, type: props.type }"
      @update:value="emit('update:modelValue', $event)"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    >
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </NInput>
    <p v-if="error || helpText" :id="messageId" class="field-control__message" :class="{ 'field-control__message--error': error }">
      {{ error || helpText }}
    </p>
  </div>
</template>

<style scoped>
.field-control { display: grid; gap: var(--space-2); min-width: 0; }
.field-control__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.field-control__label span { color: var(--color-danger); }
.field-control__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.field-control__message--error { color: var(--color-danger); }
</style>
