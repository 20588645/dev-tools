<script setup lang="ts">
import { computed, useId } from 'vue'
import { NCheckbox } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  id?: string
  label: string
  description?: string
  disabled?: boolean
}>(), { modelValue: false, id: undefined, description: undefined, disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-checkbox-${generatedId}`)
</script>

<template>
  <NCheckbox
    :id="inputId"
    :checked="modelValue"
    :disabled="disabled"
    @update:checked="emit('update:modelValue', $event)"
  >
    <span class="choice-control__copy">
      <span class="choice-control__label">{{ label }}</span>
      <span v-if="description" class="choice-control__description">{{ description }}</span>
    </span>
  </NCheckbox>
</template>

<style scoped>
.choice-control__copy { display: grid; gap: 2px; }
.choice-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.choice-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
</style>
