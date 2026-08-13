<script setup lang="ts">
/** redesign-v2 统计卡：顶部 3px 色条 + 大数字 + 弱化补充行（用量统计等页共用）。 */
export type StatCardTone = 'action' | 'running' | 'success' | 'warning' | 'danger' | 'none'

withDefaults(defineProps<{
  label: string
  tone?: StatCardTone
}>(), {
  tone: 'action',
})
</script>

<template>
  <div class="stat-card" :class="`stat-card--${tone}`">
    <div class="stat-card__label">{{ label }}</div>
    <div class="stat-card__value"><slot /></div>
    <div v-if="$slots.meta" class="stat-card__meta"><slot name="meta" /></div>
  </div>
</template>

<style scoped>
.stat-card {
  position: relative;
  padding: 14px 17px;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--component-card-radius);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.stat-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: var(--stat-card-hue, var(--color-action-gradient));
  opacity: 0.9;
}

.stat-card--none::before { content: none; }
.stat-card--running { --stat-card-hue: linear-gradient(90deg, var(--color-running), var(--color-action)); }
.stat-card--success { --stat-card-hue: linear-gradient(90deg, var(--color-success), color-mix(in srgb, var(--color-success) 55%, var(--color-neutral-0))); }
.stat-card--warning { --stat-card-hue: linear-gradient(90deg, var(--color-warning), color-mix(in srgb, var(--color-warning) 55%, var(--color-neutral-0))); }
.stat-card--danger { --stat-card-hue: linear-gradient(90deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 55%, var(--color-neutral-0))); }

.stat-card__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
}

.stat-card__value {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 25px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.8px;
}

.stat-card__value :deep(small) {
  color: var(--color-text-subtle);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
}

.stat-card__meta {
  margin-top: 2px;
  color: var(--color-text-subtle);
  font-size: 11.5px;
}

.stat-card__meta :deep(b) {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}
</style>
