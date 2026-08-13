<script setup lang="ts">
/** redesign-v2 平滑面积趋势图：渐变曲线 + 淡填充 + 底部刻度 + 可选圆点标记。 */
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  values: number[]
  labels?: string[]
  /** 需要圆点标记的 values 下标（如峰值与今天） */
  markers?: number[]
  height?: number
  ariaLabel?: string
}>(), {
  labels: () => [],
  markers: () => [],
  height: 120,
  ariaLabel: '趋势图',
})

const VIEW_WIDTH = 100
const VIEW_HEIGHT = 40
const PAD_X = 3
const PAD_Y = 4

const gradientId = `area-chart-${useId()}`

const points = computed(() => {
  const values = props.values.length > 0 ? props.values : [0, 0]
  const min = Math.min(...values, 0)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = values.length > 1 ? (VIEW_WIDTH - PAD_X * 2) / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: PAD_X + index * step,
    y: PAD_Y + (1 - (value - min) / span) * (VIEW_HEIGHT - PAD_Y * 2),
  }))
})

/** Catmull-Rom 转三次贝塞尔，得到平滑曲线 */
const linePath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  let path = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return path
})

const areaPath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  return `${linePath.value} L${pts.at(-1)?.x.toFixed(2)},${VIEW_HEIGHT} L${pts[0].x.toFixed(2)},${VIEW_HEIGHT} Z`
})

const markerPoints = computed(() => props.markers
  .filter((index) => index >= 0 && index < points.value.length)
  .map((index) => points.value[index]))
</script>

<template>
  <div class="area-chart" role="img" :aria-label="ariaLabel">
    <svg
      :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
      :style="{ height: `${height}px` }"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="`${gradientId}-fill`" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" class="area-chart__fill-strong" />
          <stop offset="100%" class="area-chart__fill-faint" />
        </linearGradient>
        <linearGradient :id="`${gradientId}-line`" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color: var(--color-action)" />
          <stop offset="100%" style="stop-color: var(--color-action-secondary)" />
        </linearGradient>
      </defs>
      <path :d="areaPath" :fill="`url(#${gradientId}-fill)`" stroke="none" />
      <path
        :d="linePath"
        fill="none"
        :stroke="`url(#${gradientId}-line)`"
        class="area-chart__line"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-for="(point, index) in markerPoints"
        :key="index"
        :cx="point.x"
        :cy="point.y"
        r="2.4"
        class="area-chart__marker"
      />
    </svg>
    <div v-if="labels.length > 0" class="area-chart__labels">
      <span v-for="(label, index) in labels" :key="index">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.area-chart {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.area-chart svg {
  display: block;
  width: 100%;
}

.area-chart__line {
  stroke-width: 2;
  stroke-linecap: round;
}

.area-chart__marker {
  fill: var(--color-action);
  stroke: var(--color-surface);
  stroke-width: 1.2;
}

.area-chart__fill-strong { stop-color: var(--color-action); stop-opacity: 0.22; }
.area-chart__fill-faint { stop-color: var(--color-action); stop-opacity: 0.02; }

.area-chart__labels {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10px;
}
</style>
