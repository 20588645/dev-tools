<script setup lang="ts">
/** redesign-v2 柱状图原语：渐变圆角柱 + 底部刻度 + 可选柱顶数值。 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  values: number[]
  labels?: string[]
  showValues?: boolean
  /** 数值格式化（柱顶与无障碍标签共用） */
  formatValue?: (value: number) => string
  height?: number
  maxBarWidth?: number
  ariaLabel?: string
}>(), {
  labels: () => [],
  showValues: false,
  formatValue: (value: number) => String(value),
  height: 150,
  maxBarWidth: 36,
  ariaLabel: '柱状图',
})

const bars = computed(() => {
  const max = Math.max(...props.values, 1)
  return props.values.map((value, index) => ({
    value,
    percent: Math.max(0, (value / max) * 100),
    label: props.labels[index],
    display: props.formatValue(value),
  }))
})
</script>

<template>
  <div class="bar-chart" role="img" :aria-label="ariaLabel">
    <div class="bar-chart__bars" :style="{ height: `${height}px` }">
      <div v-for="(bar, index) in bars" :key="index" class="bar-chart__col">
        <span v-if="showValues" class="bar-chart__value">{{ bar.display }}</span>
        <i
          class="bar-chart__bar"
          :style="{ height: `${bar.percent}%`, maxWidth: `${maxBarWidth}px` }"
          :title="bar.label ? `${bar.label} ${bar.display}` : bar.display"
        />
        <span v-if="bar.label !== undefined" class="bar-chart__label">{{ bar.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar-chart { min-width: 0; }

.bar-chart__bars {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
}

.bar-chart__col {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}

.bar-chart__bar {
  display: block;
  width: 100%;
  min-height: 2px;
  border-radius: 7px 7px 3px 3px;
  background: var(--color-action-gradient);
  opacity: 0.92;
  transition: height var(--duration-slow) var(--ease-standard);
}

.bar-chart__value {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.bar-chart__label {
  overflow: hidden;
  max-width: 100%;
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
