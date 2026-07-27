<script setup lang="ts">
import { computed } from 'vue'
import { NProgress } from 'naive-ui'

const props = withDefaults(defineProps<{
  value: number
  label?: string
  tone?: 'action' | 'info' | 'success' | 'warning' | 'danger'
}>(), {
  label: undefined,
  tone: 'action',
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
    rail-color="var(--color-surface-subtle)"
    :aria-label="label"
  />
</template>

<style scoped>
.base-progress {
  width: 100%;
}
</style>
