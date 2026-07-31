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
  shape?: 'line' | 'circle'
  size?: number
  strokeWidth?: number
  showIndicator?: boolean
}>(), {
  label: undefined,
  tone: 'action',
  processing: false,
  shape: 'line',
  size: 48,
  strokeWidth: undefined,
  showIndicator: undefined,
})

const percentage = computed(() => Math.max(0, Math.min(100, props.value)))
const color = computed(() => ({
  action: 'var(--color-action)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
}[props.tone]))
const indicatorVisible = computed(() => props.showIndicator ?? props.shape === 'circle')
const resolvedStrokeWidth = computed(() => props.strokeWidth ?? (props.shape === 'circle' ? 8 : 7))
const progressStyle = computed(() => props.shape === 'circle'
  ? { width: `${props.size}px`, height: `${props.size}px` }
  : undefined)
</script>

<template>
  <NProgress
    class="base-progress"
    :class="`base-progress--${shape}`"
    :style="progressStyle"
    :type="shape"
    :percentage="percentage"
    :show-indicator="indicatorVisible"
    :height="shape === 'line' ? resolvedStrokeWidth : undefined"
    :stroke-width="resolvedStrokeWidth"
    :border-radius="999"
    :fill-border-radius="999"
    :color="color"
    :processing="processing"
    rail-color="var(--color-surface-subtle)"
    :aria-label="label"
  >
    <template v-if="$slots.default" #default>
      <slot :percentage="percentage" />
    </template>
  </NProgress>
</template>

<style scoped>
.base-progress--line {
  width: 100%;
}

.base-progress--circle {
  flex: none;
}
</style>
