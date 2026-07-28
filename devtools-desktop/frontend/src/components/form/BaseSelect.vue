<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { NSelect, type SelectOption as NaiveSelectOption } from 'naive-ui'

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
  ariaLabel?: string
  placeholder?: string
  helpText?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>(), {
  modelValue: '', id: undefined, label: undefined, ariaLabel: undefined, placeholder: undefined, helpText: undefined,
  error: undefined, disabled: false, required: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const selectId = computed(() => props.id ?? `base-select-${generatedId}`)
const messageId = computed(() => `${selectId.value}-message`)
const naiveOptions = computed<NaiveSelectOption[]>(() => props.options as unknown as NaiveSelectOption[])
const overlayTarget = ref<HTMLElement | undefined>()
const selectThemeOverrides = {
  peers: {
    InternalSelection: {
      heightSmall: 'var(--component-control-height-sm)',
      borderRadius: 'var(--component-control-radius)',
      paddingSingle: '0 var(--space-3)',
      fontSizeSmall: 'var(--font-size-xs)',
      color: 'var(--component-control-surface)',
      border: '1px solid var(--component-control-border)',
      borderHover: '1px solid var(--component-control-border-hover)',
      borderActive: '1px solid var(--component-control-border-focus)',
      borderFocus: '1px solid var(--component-control-border-focus)',
      boxShadowActive: 'none',
      boxShadowFocus: 'var(--component-control-focus-ring)',
      textColor: 'var(--color-text)',
      placeholderColor: 'var(--color-text-subtle)',
      arrowColor: 'var(--color-text-muted)',
    },
    InternalSelectMenu: {
      optionFontSizeSmall: 'var(--font-size-xs)',
      optionHeightSmall: 'var(--component-control-height-sm)',
      optionTextColor: 'var(--color-text-muted)',
      optionTextColorActive: 'var(--color-action)',
      optionColorActive: 'color-mix(in srgb, var(--color-action) 10%, transparent)',
      borderRadius: 'var(--component-control-radius)',
      paddingSmall: 'var(--space-1)',
      optionPaddingSmall: '0 var(--space-3)',
    },
  },
}

onMounted(() => {
  overlayTarget.value = document.querySelector<HTMLElement>('#ui-foundation-preview') ?? undefined
})
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="selectId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NSelect
      :id="selectId"
      :value="modelValue || null"
      :options="naiveOptions"
      :placeholder="placeholder"
      size="small"
      :theme-overrides="selectThemeOverrides"
      :to="overlayTarget"
      :disabled="disabled"
      :status="error ? 'error' : undefined"
      :virtual-scroll="false"
      :aria-label="ariaLabel || label"
      :aria-required="required || undefined"
      :aria-invalid="Boolean(error)"
      :aria-describedby="helpText || error ? messageId : undefined"
      @update:value="emit('update:modelValue', $event || '')"
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
