<script setup lang="ts">
/** redesign-v2 分段占比条：一根分段堆叠条 + 图例（模型构成等占比场景共用）。 */
import { computed } from 'vue'

export interface SplitBarSegment {
  label: string
  percent: number
}

const props = withDefaults(defineProps<{
  segments: SplitBarSegment[]
  showLegend?: boolean
  height?: number
  ariaLabel?: string
}>(), {
  showLegend: true,
  height: 8,
  ariaLabel: '构成占比',
})

const SERIES_LIMIT = 3

const normalized = computed(() => {
  const total = props.segments.reduce((sum, segment) => sum + Math.max(0, segment.percent), 0) || 1
  return props.segments.map((segment, index) => ({
    ...segment,
    width: (Math.max(0, segment.percent) / total) * 100,
    color: index < SERIES_LIMIT ? `var(--color-series-${index + 1})` : 'var(--color-series-muted)',
  }))
})
</script>

<template>
  <div class="split-bar" role="img" :aria-label="ariaLabel">
    <div class="split-bar__track" :style="{ height: `${height}px` }">
      <i
        v-for="segment in normalized"
        :key="segment.label"
        class="split-bar__segment"
        :style="{ width: `${segment.width}%`, background: segment.color }"
        :title="`${segment.label} ${Math.round(segment.percent)}%`"
      />
    </div>
    <div v-if="showLegend" class="split-bar__legend">
      <span v-for="segment in normalized" :key="segment.label" class="split-bar__legend-item">
        <i class="split-bar__swatch" :style="{ background: segment.color }" />
        {{ segment.label }} {{ Math.round(segment.percent) }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.split-bar {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.split-bar__track {
  display: flex;
  gap: 2px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-surface-subtle);
}

.split-bar__segment {
  display: block;
  height: 100%;
  min-width: 2px;
}

.split-bar__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
  font-size: 11.5px;
}

.split-bar__legend-item {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  white-space: nowrap;
}

.split-bar__swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 4px;
}
</style>
