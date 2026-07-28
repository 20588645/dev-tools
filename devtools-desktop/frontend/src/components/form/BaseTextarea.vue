<script setup lang="ts">
import { computed, useId } from 'vue'
import { NInput } from 'naive-ui'

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
  modelValue: '', id: undefined, label: undefined, placeholder: undefined, rows: 4,
  helpText: undefined, error: undefined, disabled: false, required: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const textareaId = computed(() => props.id ?? `base-textarea-${generatedId}`)
const labelId = computed(() => `${textareaId.value}-label`)
const messageId = computed(() => `${textareaId.value}-message`)
</script>

<template>
  <div class="field-control">
    <label v-if="label" :id="labelId" class="field-control__label" :for="textareaId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NInput
      type="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :status="error ? 'error' : undefined"
      :aria-required="required || undefined"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      :input-props="{ id: textareaId, 'aria-labelledby': label ? labelId : undefined }"
      @update:value="emit('update:modelValue', $event)"
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
.field-control__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.field-control__message--error { color: var(--color-danger); }
</style>
