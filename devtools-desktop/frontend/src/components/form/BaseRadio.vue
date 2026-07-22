<script setup lang="ts">
import { computed, useId } from 'vue'
import { NRadio } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue?: string
  value: string
  name: string
  id?: string
  label: string
  description?: string
  disabled?: boolean
}>(), { modelValue: '', id: undefined, description: undefined, disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-radio-${generatedId}`)
</script>

<template>
  <NRadio
    :id="inputId"
    :name="name"
    :value="value"
    :checked="modelValue === value"
    :disabled="disabled"
    @update:checked="(checked) => checked && emit('update:modelValue', value)"
  >
    <span class="choice-control__copy">
      <span class="choice-control__label">{{ label }}</span>
      <span v-if="description" class="choice-control__description">{{ description }}</span>
    </span>
  </NRadio>
</template>

<style scoped>
.choice-control__copy { display: grid; gap: 2px; }
.choice-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.choice-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
</style>
