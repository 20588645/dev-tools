<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { NDatePicker } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue?: string
  id?: string
  label?: string
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  /** 'future' 只允许今天及以后（提醒时间）；'any' 不限制（查询历史区间） */
  range?: 'future' | 'any'
}>(), {
  modelValue: '',
  id: undefined,
  label: undefined,
  placeholder: '选择日期和时间',
  clearable: true,
  disabled: false,
  range: 'future',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-date-time-${generatedId}`)
const timestamp = computed<number | null>(() => {
  if (!props.modelValue) return null
  const value = new Date(props.modelValue).getTime()
  return Number.isFinite(value) ? value : null
})
const overlayTarget = ref<HTMLElement | undefined>()

onMounted(() => {
  overlayTarget.value = document.querySelector<HTMLElement>('#app') ?? document.body
})

function update(value: number | null) {
  emit('update:modelValue', value ? new Date(value).toISOString() : '')
}

const isDateDisabled = computed(() => props.range === 'any'
  ? undefined
  : (value: number) => value < Date.now() - 86_400_000)
</script>

<template>
  <div class="field-control">
    <label v-if="label" class="field-control__label" :for="inputId">{{ label }}</label>
    <NDatePicker
      :id="inputId"
      :value="timestamp"
      type="datetime"
      :placeholder="placeholder"
      :clearable="clearable"
      :disabled="disabled"
      :to="overlayTarget"
      :actions="['now', 'confirm']"
      :is-date-disabled="isDateDisabled"
      @update:value="update"
    />
  </div>
</template>

<style scoped>
.field-control { display: grid; gap: var(--space-2); min-width: 0; }
.field-control__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.field-control :deep(.n-date-picker),
.field-control :deep(.n-input) {
  height: var(--component-control-height-md);
  min-height: var(--component-control-height-md);
  width: 100%;
}
</style>
