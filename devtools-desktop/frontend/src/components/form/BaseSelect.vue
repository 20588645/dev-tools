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
  /** 默认 md，与 BaseInput 同档；工具栏等紧凑区传 sm。 */
  size?: 'sm' | 'md'
}>(), {
  modelValue: '', id: undefined, label: undefined, ariaLabel: undefined, placeholder: undefined, helpText: undefined,
  error: undefined, disabled: false, required: false, size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const selectId = computed(() => props.id ?? `base-select-${generatedId}`)
const messageId = computed(() => `${selectId.value}-message`)
const naiveOptions = computed<NaiveSelectOption[]>(() => props.options as unknown as NaiveSelectOption[])

/**
 * 空串是合法取值时不能退化成「未选择」。
 *
 * 原实现一律 `modelValue || null`，于是 `{ value: '', label: '系统默认' }` 这类
 * 选项永远显示成 placeholder（「请选择」），用户看不到自己实际选中的是什么。
 * 只有当选项里确实没有空串项时，空的 modelValue 才表示未选择。
 */
const hasEmptyOption = computed(() => props.options.some(option => option.value === ''))
const selectedValue = computed<string | null>(() => (
  props.modelValue === '' && !hasEmptyOption.value ? null : props.modelValue
))
const naiveSize = computed(() => (props.size === 'sm' ? 'small' : 'medium'))
/**
 * 菜单必须传送出弹窗：`:to="undefined"` 会覆盖 Naive 默认的 body，
 * 下拉就画在对话框内部，被 overflow 裁切，看起来像原生 select。
 * 预览页挂到 #ui-foundation-preview，应用里挂 body。
 */
const overlayTarget = ref<HTMLElement | string>('body')
const selectThemeOverrides = {
  peers: {
    InternalSelection: {
      heightSmall: 'var(--component-control-height-sm)',
      heightMedium: 'var(--component-input-height)',
      borderRadius: 'var(--component-control-radius)',
      paddingSingle: '0 var(--space-3)',
      fontSizeSmall: 'var(--font-size-xs)',
      fontSizeMedium: 'var(--font-size-sm)',
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
      color: 'var(--color-surface-raised)',
      boxShadow: 'var(--shadow-lg)',
      borderRadius: 'var(--radius-lg)',
      optionFontSizeSmall: 'var(--font-size-xs)',
      optionFontSizeMedium: 'var(--font-size-sm)',
      optionHeightSmall: 'var(--component-control-height-sm)',
      optionHeightMedium: 'var(--component-input-height)',
      optionTextColor: 'var(--color-text-muted)',
      optionTextColorActive: 'var(--color-action)',
      optionColorActive: 'color-mix(in srgb, var(--color-action) 10%, transparent)',
      optionColorPending: 'color-mix(in srgb, var(--color-action) 8%, transparent)',
      paddingSmall: 'var(--space-1)',
      paddingMedium: 'var(--space-2)',
      optionPaddingSmall: '0 var(--space-3)',
      optionPaddingMedium: '0 var(--space-4)',
    },
  },
}

onMounted(() => {
  overlayTarget.value = document.querySelector<HTMLElement>('#ui-foundation-preview') ?? 'body'
})
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="selectId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <NSelect
      :id="selectId"
      :value="selectedValue"
      :options="naiveOptions"
      :placeholder="placeholder"
      :size="naiveSize"
      :theme-overrides="selectThemeOverrides"
      :to="overlayTarget"
      consistent-menu-width
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
