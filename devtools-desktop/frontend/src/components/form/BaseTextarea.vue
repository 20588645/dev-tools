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
  readonly?: boolean
  required?: boolean
  ariaLabel?: string
  variant?: 'default' | 'plain' | 'editor'
  labelVariant?: 'default' | 'eyebrow'
  resize?: 'vertical' | 'none'
  autosize?: boolean | { minRows?: number, maxRows?: number }
  fillHeight?: boolean
}>(), {
  modelValue: '', id: undefined, label: undefined, placeholder: undefined, rows: 4,
  helpText: undefined, error: undefined, disabled: false, readonly: false, required: false,
  ariaLabel: undefined, variant: 'default', labelVariant: 'default', resize: 'vertical', autosize: false, fillHeight: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const textareaId = computed(() => props.id ?? `base-textarea-${generatedId}`)
const labelId = computed(() => `${textareaId.value}-label`)
const messageId = computed(() => `${textareaId.value}-message`)
const textareaThemeOverrides = computed(() => props.variant === 'default' ? undefined : ({
  color: 'transparent',
  colorFocus: 'transparent',
  border: '1px solid transparent',
  borderHover: '1px solid var(--component-control-border-hover)',
  borderFocus: '1px solid var(--component-control-border-focus)',
  boxShadowFocus: 'var(--component-control-focus-ring)',
  paddingSmall: props.variant === 'editor' ? '0' : undefined,
  paddingMedium: props.variant === 'editor' ? '0' : undefined,
  paddingLarge: props.variant === 'editor' ? '0' : undefined,
}))
</script>

<template>
  <div
    class="field-control"
    :class="[
      `field-control--${variant}`,
      {
        'field-control--fill-height': fillHeight,
        'field-control--has-message': Boolean(error || helpText),
        'field-control--label-eyebrow': labelVariant === 'eyebrow',
      },
    ]"
  >
    <label v-if="label" :id="labelId" class="field-control__label" :for="textareaId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NInput
      type="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :readonly="readonly"
      :autosize="autosize"
      :resizable="resize === 'vertical'"
      :status="error ? 'error' : undefined"
      :aria-required="required || undefined"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      :input-props="{ id: textareaId, 'aria-label': ariaLabel, 'aria-labelledby': label ? labelId : undefined }"
      :theme-overrides="textareaThemeOverrides"
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
.field-control--label-eyebrow .field-control__label {
  color: var(--color-text-subtle);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.field-control--editor :deep(.n-input) { background: transparent; }
.field-control--editor :deep(.n-input__border),
.field-control--editor :deep(.n-input__state-border) { display: none; }
.field-control--editor :deep(.n-input__textarea-el) {
  min-height: 0;
  padding: 2px 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.9;
  overflow-y: auto;
}
.field-control--fill-height { grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
.field-control--fill-height.field-control--has-message { grid-template-rows: auto minmax(0, 1fr) auto; }
.field-control--fill-height :deep(.n-input) { height: 100%; min-height: 0; }
.field-control--fill-height :deep(.n-input-wrapper),
.field-control--fill-height :deep(.n-input__textarea) { height: 100%; min-height: 0; }
.field-control--fill-height :deep(.n-input__textarea-el) { height: 100%; }
@media (max-width: 980px) {
  .field-control--editor :deep(.n-input__textarea-el) {
    min-height: 42px;
    font-size: 12px;
    line-height: 1.7;
  }
}
</style>
