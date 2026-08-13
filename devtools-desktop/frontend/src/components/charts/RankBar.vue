<script setup lang="ts">
/** redesign-v2 排行条：名称 + 胶囊轨道 + 右对齐数值（用量排行 / 首页共用）。 */
import { computed } from 'vue'

export type RankBarSeries = 'action' | 1 | 2 | 3

const props = withDefaults(defineProps<{
  label: string
  value?: string
  percent: number
  /** action = 主题渐变；1/2/3 = 数据系列色 */
  series?: RankBarSeries
  labelWidth?: string
}>(), {
  value: undefined,
  series: 'action',
  labelWidth: '130px',
})

const clamped = computed(() => Math.max(0, Math.min(100, props.percent)))
const fillStyle = computed(() => {
  const background = props.series === 'action'
    ? 'var(--color-action-gradient)'
    : `var(--color-series-${props.series})`
  return { width: `${clamped.value}%`, background }
})
</script>

<template>
  <div class="rank-bar" role="meter" :aria-valuenow="clamped" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
    <span class="rank-bar__label" :style="{ width: labelWidth }" :title="label">{{ label }}</span>
    <span class="rank-bar__track"><i class="rank-bar__fill" :style="fillStyle" /></span>
    <span v-if="value !== undefined" class="rank-bar__value">{{ value }}</span>
  </div>
</template>

<style scoped>
.rank-bar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
  font-size: 12.5px;
}

.rank-bar__label {
  flex: none;
  overflow: hidden;
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-bar__track {
  flex: 1;
  height: 7px;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-surface-subtle);
}

.rank-bar__fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width var(--duration-slow) var(--ease-standard);
}

.rank-bar__value {
  flex: none;
  width: 76px;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-align: right;
}
</style>
