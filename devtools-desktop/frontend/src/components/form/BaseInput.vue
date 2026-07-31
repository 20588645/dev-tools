<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue'
import { NInput } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  id?: string
  label?: string
  ariaLabel?: string
  type?: 'text' | 'search' | 'email' | 'url' | 'number' | 'password'
  placeholder?: string
  helpText?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  autocomplete?: string
  variant?: 'default' | 'plain' | 'search' | 'title'
  labelVariant?: 'default' | 'eyebrow'
  size?: 'sm' | 'md' | 'lg'
}>(), {
  modelValue: '', id: undefined, label: undefined, ariaLabel: undefined, type: 'text', placeholder: undefined,
  helpText: undefined, error: undefined, disabled: false, readonly: false, required: false,
  autocomplete: undefined,
  variant: 'default', labelVariant: 'default', size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const generatedId = useId()
const inputId = computed(() => props.id ?? `base-input-${generatedId}`)
const labelId = computed(() => `${inputId.value}-label`)
const messageId = computed(() => `${inputId.value}-message`)
const inputType = computed<'text' | 'password'>(() => props.type === 'password' ? 'password' : 'text')
const inputSize = computed(() => ({ sm: 'small' as const, md: 'medium' as const, lg: 'large' as const })[props.size])
const inputThemeOverrides = computed(() => {
  if (props.variant === 'default') return undefined
  if (props.variant === 'search') {
    return {
      color: 'var(--color-surface-raised)',
      colorFocus: 'var(--color-surface-raised)',
      border: '1px solid var(--component-control-border)',
      borderHover: '1px solid var(--component-control-border-hover)',
      borderFocus: '1px solid var(--component-control-border-focus)',
      boxShadowFocus: 'var(--component-control-focus-ring)',
    }
  }
  return {
    color: 'transparent',
    colorFocus: 'transparent',
    border: '1px solid transparent',
    borderHover: '1px solid var(--component-control-border-hover)',
    borderFocus: '1px solid var(--component-control-border-focus)',
    boxShadowFocus: 'var(--component-control-focus-ring)',
    paddingSmall: props.variant === 'title' ? '0' : undefined,
    paddingMedium: props.variant === 'title' ? '0' : undefined,
    paddingLarge: props.variant === 'title' ? '0' : undefined,
    fontSizeLarge: props.variant === 'title' ? 'var(--font-size-xl)' : undefined,
    fontWeight: props.variant === 'title' ? 'var(--font-weight-semibold)' : undefined,
  }
})

/* 转发底层输入控制，供调用方在弹窗打开、校验失败等场景主动聚焦 */
const input = useTemplateRef<InstanceType<typeof NInput>>('input')
defineExpose({
  focus: () => input.value?.focus(),
  blur: () => input.value?.blur(),
  select: () => input.value?.select(),
})
</script>

<template>
  <div
    class="field-control"
    :class="[`field-control--${variant}`, `field-control--size-${size}`, { 'field-control--label-eyebrow': labelVariant === 'eyebrow' }]"
  >
    <label v-if="label" :id="labelId" class="field-control__label" :for="inputId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NInput
      ref="input"
      :value="String(modelValue ?? '')"
      :type="inputType"
      :size="inputSize"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :status="error ? 'error' : undefined"
      :aria-required="required || undefined"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      :input-props="{
        id: inputId,
        type: props.type,
        autocomplete,
        'aria-label': ariaLabel,
        'aria-labelledby': label ? labelId : undefined,
      }"
      :theme-overrides="inputThemeOverrides"
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
.field-control--search :deep(.n-input) { box-shadow: var(--shadow-sm); }
.field-control--title { gap: var(--space-1); }
.field-control--label-eyebrow .field-control__label {
  color: var(--color-text-subtle);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.field-control--title :deep(.n-input) { background: transparent; border-radius: 0; }
.field-control--title :deep(.n-input__border) {
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
}
.field-control--title :deep(.n-input__state-border) {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-action) 64%, var(--color-border));
  border-radius: 0;
}
.field-control--title :deep(.n-input__input-el) {
  height: 40px;
  padding: 0;
  font-size: 18px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.025em;
}
.field-control--title.field-control--size-lg :deep(.n-input__input-el) {
  height: 48px;
  font-size: clamp(20px, 2.1vw, 29px);
}
@media (max-width: 980px) {
  .field-control--title.field-control--size-lg :deep(.n-input__input-el) {
    height: 40px;
    font-size: 19px;
  }
}
</style>
