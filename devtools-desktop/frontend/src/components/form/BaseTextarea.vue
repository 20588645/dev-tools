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
  textVariant?: 'default' | 'relaxed'
  resize?: 'vertical' | 'none'
  autosize?: boolean | { minRows?: number, maxRows?: number }
  fillHeight?: boolean
}>(), {
  modelValue: '', id: undefined, label: undefined, placeholder: undefined, rows: 4,
  helpText: undefined, error: undefined, disabled: false, readonly: false, required: false,
  ariaLabel: undefined, variant: 'default', labelVariant: 'default', textVariant: 'default', resize: 'vertical', autosize: false, fillHeight: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const textareaId = computed(() => props.id ?? `base-textarea-${generatedId}`)
const labelId = computed(() => `${textareaId.value}-label`)
const messageId = computed(() => `${textareaId.value}-message`)
const textareaThemeOverrides = computed(() => {
  if (props.variant === 'default') return undefined
  // redesign-v2 editor 变体 = 原型 .ed-area textarea：白面细边大圆角输入区
  if (props.variant === 'editor') {
    return {
      color: 'var(--color-surface)',
      colorFocus: 'var(--color-surface)',
      border: '1px solid var(--component-control-border)',
      borderHover: '1px solid var(--component-control-border-hover)',
      borderFocus: '1px solid var(--component-control-border-focus)',
      boxShadowFocus: 'var(--component-control-focus-ring)',
      borderRadius: 'var(--radius-md)',
      paddingSmall: 'var(--space-3) var(--space-4)',
      paddingMedium: 'var(--space-4)',
      paddingLarge: 'var(--space-4) var(--space-5)',
    }
  }
  return {
    color: 'transparent',
    colorFocus: 'transparent',
    border: '1px solid transparent',
    borderHover: '1px solid var(--component-control-border-hover)',
    borderFocus: '1px solid var(--component-control-border-focus)',
    boxShadowFocus: 'var(--component-control-focus-ring)',
  }
})
</script>

<template>
  <div
    class="field-control"
    :class="[
      `field-control--${variant}`,
      `field-control--text-${textVariant}`,
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
.field-control--editor :deep(.n-input) {
  --n-padding-top: var(--space-4);
  --n-padding-bottom: var(--space-4);
  --n-padding-left: var(--space-4);
  --n-padding-right: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}
.field-control--editor :deep(.n-input__placeholder),
.field-control--editor :deep(.n-input__textarea-el) {
  box-sizing: border-box;
  min-height: 0;
  padding: var(--space-4);
  font-size: 13px;
  line-height: 1.9;
}
.field-control--editor :deep(.n-input__textarea-el) {
  color: var(--color-text);
  overflow-y: auto;
}
.field-control--text-relaxed :deep(.n-input__textarea-el) { line-height: 1.72; }
.field-control--fill-height { grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
.field-control--fill-height.field-control--has-message { grid-template-rows: auto minmax(0, 1fr) auto; }
.field-control--fill-height :deep(.n-input) { height: 100%; min-height: 0; }
.field-control--fill-height :deep(.n-input-wrapper),
.field-control--fill-height :deep(.n-input__textarea) { height: 100%; min-height: 0; }
.field-control--fill-height :deep(.n-input__textarea-el) { height: 100%; }
@media (max-width: 980px) {
  .field-control--editor :deep(.n-input__placeholder),
  .field-control--editor :deep(.n-input__textarea-el) {
    min-height: 42px;
    padding: var(--space-3);
    font-size: 12px;
    line-height: 1.7;
  }
}
</style>
