<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
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
  /**
   * 轨道对比度。默认 `subtle` 适合较粗的进度条；
   * 细线（1~2px）需要 `visible`，否则未完成的一段几乎看不见，会被误读成线断了。
   */
  rail?: 'subtle' | 'visible'
  /**
   * value 的更新间隔（毫秒）。倒计时这类按固定节拍跳变的进度需要指定它：
   * 填充会在整个间隔内线性滑动，而不是每拍急冲一小段再停住（看起来像闪烁）。
   */
  tickInterval?: number
}>(), {
  label: undefined,
  tone: 'action',
  processing: false,
  shape: 'line',
  size: 48,
  strokeWidth: undefined,
  showIndicator: undefined,
  rail: 'subtle',
  tickInterval: undefined,
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
const railColor = computed(() => props.rail === 'visible'
  ? 'var(--color-border)'
  : 'var(--color-surface-subtle)')
const progressStyle = computed<CSSProperties>(() => ({
  ...(props.shape === 'circle' ? { width: `${props.size}px`, height: `${props.size}px` } : null),
  ...(props.tickInterval ? { '--base-progress-tick': `${props.tickInterval}ms` } : null),
}))
</script>

<template>
  <NProgress
    class="base-progress"
    :class="[
      `base-progress--${shape}`,
      { 'base-progress--ticking': Boolean(tickInterval) },
    ]"
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
    :rail-color="railColor"
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

/*
  受控第三方适配：组件库对填充用的是 max-width 0.2s ease，
  按固定节拍推进时会在 200ms 内急冲一段再停住，看起来是闪烁。
  指定 tickInterval 后把过渡拉长到整个节拍并改成线性，填充变成连续滑动。
*/
/*
  受控第三方适配：组件库的过渡规则是 5 层选择器（.n-progress …
  .n-progress-graph-line-rail .n-progress-graph-line-fill），
  这里必须匹配同样的层级深度才能提权覆盖。
*/
.base-progress--ticking
:deep(.n-progress-graph .n-progress-graph-line .n-progress-graph-line-rail .n-progress-graph-line-fill) {
  transition:
    background-color var(--duration-slow) var(--ease-standard),
    max-width var(--base-progress-tick) linear;
}

.base-progress--ticking
:deep(.n-progress-graph .n-progress-graph-circle .n-progress-graph-circle-fill) {
  transition:
    stroke var(--duration-slow) var(--ease-standard),
    stroke-dasharray var(--base-progress-tick) linear;
}

@media (prefers-reduced-motion: reduce) {
  .base-progress--ticking
  :deep(.n-progress-graph .n-progress-graph-line .n-progress-graph-line-rail .n-progress-graph-line-fill),
  .base-progress--ticking
  :deep(.n-progress-graph .n-progress-graph-circle .n-progress-graph-circle-fill) {
    transition-duration: .01ms;
  }
}

.base-progress--circle {
  flex: none;
}
</style>
