<script setup lang="ts">
/** redesign-v2 圆环仪表：SVG 描边环 + 中心插槽（纯净检测评分 / 首页卡片共用）。 */
import { computed, useId } from 'vue'

export type ScoreRingTone = 'action' | 'success' | 'warning' | 'danger'

const props = withDefaults(defineProps<{
  value: number
  size?: number
  strokeWidth?: number
  tone?: ScoreRingTone
  label?: string
}>(), {
  size: 120,
  strokeWidth: 10,
  tone: 'action',
  label: undefined,
})

const clamped = computed(() => Math.max(0, Math.min(100, props.value)))
const radius = computed(() => 60 - props.strokeWidth / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const dash = computed(() => `${(clamped.value / 100) * circumference.value} ${circumference.value}`)
const gradientId = `score-ring-${useId()}`
const stroke = computed(() => (props.tone === 'action' ? `url(#${gradientId})` : `var(--color-${props.tone})`))
</script>

<template>
  <div
    class="score-ring"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="meter"
    :aria-valuenow="clamped"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label ?? '评分'"
  >
    <svg viewBox="0 0 120 120" :width="size" :height="size" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color: var(--color-action)" />
          <stop offset="100%" style="stop-color: var(--color-action-secondary)" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        :r="radius"
        fill="none"
        style="stroke: var(--color-surface-subtle)"
        :stroke-width="strokeWidth"
      />
      <circle
        cx="60"
        cy="60"
        :r="radius"
        fill="none"
        :stroke="stroke"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        transform="rotate(-90 60 60)"
        class="score-ring__fill"
      />
    </svg>
    <div class="score-ring__center">
      <slot>{{ clamped }}</slot>
    </div>
  </div>
</template>

<style scoped>
.score-ring {
  position: relative;
  display: inline-grid;
  flex: none;
  place-items: center;
}

.score-ring svg { display: block; }

.score-ring__fill {
  transition: stroke-dasharray var(--duration-slow) var(--ease-standard);
}

.score-ring__center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--color-text);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
</style>
