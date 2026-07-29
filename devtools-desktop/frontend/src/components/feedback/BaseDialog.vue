<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  closable?: boolean
  /**
   * 内嵌日期/下拉选择器时设为 true。Naive 的浮层挂在 body 下的
   * .v-binder-follower-container（内联 z-index 2000，无法用 CSS 覆盖），
   * 默认对话框层级 20000 会把它压住导致无法点选，此时需让对话框退到浮层之下。
   */
  belowOverlays?: boolean
}>(), { width: 'var(--component-dialog-width)', closable: true, belowOverlays: false })

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
    :z-index="belowOverlays ? 1900 : 20000"
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
