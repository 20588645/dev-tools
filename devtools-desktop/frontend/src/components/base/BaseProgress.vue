<script setup lang="ts">
import { computed } from 'vue'
import { NProgress } from 'naive-ui'

const props = withDefaults(defineProps<{
  value: number
  label?: string
  tone?: 'action' | 'info' | 'success' | 'warning' | 'danger'
  /**
   * 进行中但时长未知（如编译阶段）。开启后轨道显示流动效果，
   * 避免用一个固定百分比暗示「卡在中间」。
   */
  processing?: boolean
}>(), {
  label: undefined,
  tone: 'action',
  processing: false,
})

const percentage = computed(() => Math.max(0, Math.min(100, props.value)))
const color = computed(() => ({
  action: 'var(--color-action)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
}[props.tone]))
</script>

<template>
  <NProgress
    class="base-progress"
    type="line"
    :percentage="percentage"
    :show-indicator="false"
    :height="7"
    :border-radius="999"
    :fill-border-radius="999"
    :color="color"
    :processing="processing"
    rail-color="var(--color-surface-subtle)"
    :aria-label="label"
  />
</template>

<style scoped>
.base-progress {
  width: 100%;
}
</style>
