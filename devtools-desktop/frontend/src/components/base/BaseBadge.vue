<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'

const props = withDefaults(defineProps<{
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}>(), { tone: 'neutral' })

const type = computed<'default' | 'info' | 'success' | 'warning' | 'error'>(() => props.tone === 'danger' ? 'error' : props.tone === 'neutral' ? 'default' : props.tone)
</script>

<template>
  <NTag class="base-badge" :class="[`base-badge--${tone}`]" :type="type" :bordered="false" size="small">
    <slot />
  </NTag>
</template>

<style scoped>
/* redesign-v2：状态胶囊 = 淡化底 + 状态色文字（badge.ok/warn/err/run 视觉语言） */
.base-badge.n-tag {
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.base-badge--neutral.n-tag { color: var(--color-text-subtle); background: var(--color-surface-subtle); }
.base-badge--info.n-tag { color: var(--color-running); background: var(--color-running-subtle); }
.base-badge--success.n-tag { color: var(--color-success); background: var(--color-success-subtle); }
.base-badge--warning.n-tag { color: var(--color-warning); background: var(--color-warning-subtle); }
.base-badge--danger.n-tag { color: var(--color-danger); background: var(--color-danger-subtle); }
</style>
