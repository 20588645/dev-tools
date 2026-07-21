<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  id?: string
  label?: string
  placeholder?: string
  rows?: number
  helpText?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>(), {
  modelValue: '',
  id: undefined,
  label: undefined,
  placeholder: undefined,
  rows: 4,
  helpText: undefined,
  error: undefined,
  disabled: false,
  required: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const textareaId = computed(() => props.id ?? `base-textarea-${generatedId}`)
const messageId = computed(() => `${textareaId.value}-message`)
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="textareaId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <textarea
      :id="textareaId"
      class="field-control__textarea"
      :class="{ 'field-control__textarea--error': error }"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :required="required"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="error || helpText" :id="messageId" class="field-control__message" :class="{ 'field-control__message--error': error }">
      {{ error || helpText }}
    </p>
  </div>
</template>

<style scoped>
.field-control { display: grid; gap: var(--space-2); min-width: 0; }
.field-control__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.field-control__label span { color: var(--color-danger); }
.field-control__textarea { width: 100%; min-height: 88px; padding: var(--space-3); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--component-control-radius); outline: 0; resize: vertical; font: inherit; line-height: var(--line-height-normal); transition: border-color var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard); }
.field-control__textarea:focus-visible { border-color: var(--color-focus-ring); box-shadow: var(--component-focus-outline); }
.field-control__textarea::placeholder { color: var(--color-text-subtle); }
.field-control__textarea--error { border-color: var(--color-danger); }
.field-control__textarea:disabled { background: var(--color-surface-subtle); opacity: 0.65; cursor: not-allowed; }
.field-control__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.field-control__message--error { color: var(--color-danger); }
</style>
