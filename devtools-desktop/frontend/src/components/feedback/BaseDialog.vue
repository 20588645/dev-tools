<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  closable?: boolean
}>(), { width: 'var(--component-dialog-width)', closable: true })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = ref(props.modelValue)
watch(() => props.modelValue, (value) => { visible.value = value })
watch(visible, (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value)
})
const close = () => {
  if (!props.closable) return
  visible.value = false
}
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :closable="false"
    :style="{ width }"
    :mask-closable="closable"
    :z-index="20000"
    transform-origin="center"
    :on-close="close"
    :on-mask-click="close"
  >
    <template #header>
      <div class="base-dialog__header">
        <span>{{ title }}</span>
        <NButton v-if="closable" quaternary circle size="small" aria-label="关闭" :on-click="close">×</NButton>
      </div>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </NModal>
</template>

<style scoped>
.base-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; color: var(--color-text); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
</style>
