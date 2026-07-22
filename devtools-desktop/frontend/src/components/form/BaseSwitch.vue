<script setup lang="ts">
import { computed, useId } from 'vue'
import { NSwitch } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  id?: string
  label: string
  description?: string
  disabled?: boolean
}>(), { modelValue: false, id: undefined, description: undefined, disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const generatedId = useId()
const inputId = computed(() => props.id ?? `base-switch-${generatedId}`)
</script>

<template>
  <div class="switch-control" :class="{ 'switch-control--disabled': disabled }">
    <span class="switch-control__copy">
      <span class="switch-control__label">{{ label }}</span>
      <span v-if="description" class="switch-control__description">{{ description }}</span>
    </span>
    <NSwitch
      :id="inputId"
      :value="modelValue"
      :disabled="disabled"
      @update:value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.switch-control { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); color: var(--color-text); }
.switch-control__copy { display: grid; gap: 2px; }
.switch-control__label { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.switch-control__description { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.switch-control--disabled { opacity: 0.55; }
</style>
