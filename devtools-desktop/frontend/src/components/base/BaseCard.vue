<script setup lang="ts">
import { NCard } from 'naive-ui'

withDefaults(defineProps<{
  variant?: 'default' | 'raised' | 'subtle'
  interactive?: boolean
}>(), {
  variant: 'default',
  interactive: false,
})

// Naive UI's `embedded` card variant defaults to the primary action color.
// Keep the embedded surface on the project's semantic surface token instead,
// so subtle cards remain calm in both light and dark themes.
const cardThemeOverrides = {
  color: 'var(--color-surface)',
  colorEmbedded: 'var(--color-surface-subtle)',
  colorEmbeddedModal: 'var(--color-surface-subtle)',
  colorEmbeddedPopover: 'var(--color-surface-subtle)',
  textColor: 'var(--color-text)',
  titleTextColor: 'var(--color-text)',
  borderColor: 'var(--color-border)',
}
</script>

<template>
  <NCard
    class="base-card"
    :class="[`base-card--${variant}`]"
    :bordered="variant !== 'subtle'"
    :embedded="variant === 'subtle'"
    :hoverable="interactive"
    :theme-overrides="cardThemeOverrides"
  >
    <slot />
  </NCard>
</template>

<style scoped>
.base-card { color: var(--color-text); }
</style>
