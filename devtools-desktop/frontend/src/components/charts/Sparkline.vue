<script setup lang="ts">
/** redesign-v2 迷你走势线：归一化 SVG 折线，可选面积填充（卡片内嵌小图共用）。 */
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  values: number[]
  height?: number
  area?: boolean
  ariaLabel?: string
}>(), {
  height: 32,
  area: false,
  ariaLabel: '走势',
})

const VIEW_WIDTH = 100
const VIEW_HEIGHT = 32
const PAD = 2

const gradientId = `sparkline-${useId()}`

const points = computed(() => {
  const values = props.values.length > 0 ? props.values : [0, 0]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = values.length > 1 ? (VIEW_WIDTH - PAD * 2) / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: PAD + index * step,
    y: PAD + (1 - (value - min) / span) * (VIEW_HEIGHT - PAD * 2),
  }))
})

const linePath = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '))
const areaPath = computed(() => `${linePath.value} L${points.value.at(-1)?.x.toFixed(2)},${VIEW_HEIGHT} L${points.value[0]?.x.toFixed(2)},${VIEW_HEIGHT} Z`)
</script>

<template>
  <svg
    class="sparkline"
    :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
    :style="{ height: `${height}px` }"
    preserveAspectRatio="none"
    role="img"
    :aria-label="ariaLabel"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" class="sparkline__stop-strong" />
        <stop offset="100%" class="sparkline__stop-faint" />
      </linearGradient>
    </defs>
    <path v-if="area" :d="areaPath" :fill="`url(#${gradientId})`" stroke="none" />
    <path :d="linePath" fill="none" class="sparkline__line" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 100%;
}

.sparkline__line {
  stroke: var(--color-action);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sparkline__stop-strong { stop-color: var(--color-action); stop-opacity: 0.28; }
.sparkline__stop-faint { stop-color: var(--color-action); stop-opacity: 0.02; }
</style>
