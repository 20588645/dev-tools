<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from './BaseDialog.vue'

withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: 'primary' | 'danger'
}>(), {
  title: '请确认操作',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'primary',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const confirm = () => emit('confirm')
</script>

<template>
  <BaseDialog :model-value="modelValue" :title="title" @update:model-value="emit('update:modelValue', $event)">
    <p class="confirm-dialog__message">{{ message }}</p>
    <template #footer>
      <BaseButton variant="ghost" @click="emit('update:modelValue', false)">{{ cancelText }}</BaseButton>
      <BaseButton :variant="tone" @click="confirm">{{ confirmText }}</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm-dialog__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-md); line-height: var(--line-height-relaxed); }
</style>
