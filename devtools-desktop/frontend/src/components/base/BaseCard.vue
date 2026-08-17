<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { NCard } from 'naive-ui'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'raised' | 'subtle'
  interactive?: boolean
  contentPadding?: string
  contentLayout?: 'block' | 'column' | 'fill'
  contentOverflow?: 'visible' | 'hidden' | 'auto'
  contentBackground?: string
  fillHeight?: boolean
}>(), {
  variant: 'default',
  interactive: false,
  contentPadding: 'var(--component-card-padding)',
  contentLayout: 'block',
  contentOverflow: 'visible',
  contentBackground: undefined,
  fillHeight: false,
})

const contentStyle = computed<CSSProperties>(() => ({
  padding: props.contentPadding,
  display: props.contentLayout === 'block' ? undefined : 'flex',
  flexDirection: props.contentLayout === 'block' ? undefined : 'column',
  flex: props.contentLayout === 'fill' ? '1 1 auto' : undefined,
  minHeight: props.contentLayout === 'fill' ? '0' : undefined,
  overflow: props.contentOverflow,
  background: props.contentBackground,
}))

// Naive UI's `embedded` card variant defaults to the primary action color.
// Keep the embedded surface on the project's semantic surface token instead,
// so subtle cards remain calm in both light and dark themes.
const cardThemeOverrides = {
  borderRadius: 'var(--component-card-radius)',
  color: 'var(--color-surface)',
  colorEmbedded: 'var(--color-surface-subtle)',
  colorEmbeddedModal: 'var(--color-surface-subtle)',
  colorEmbeddedPopover: 'var(--color-surface-subtle)',
  textColor: 'var(--color-text)',
  titleTextColor: 'var(--color-text)',
  borderColor: 'var(--color-border-soft)',
}
</script>

<template>
  <NCard
    class="base-card"
    :class="[`base-card--${variant}`, { 'base-card--fill-height': fillHeight }]"
    :bordered="variant !== 'subtle'"
    :embedded="variant === 'subtle'"
    :hoverable="interactive"
    :theme-overrides="cardThemeOverrides"
    :content-style="contentStyle"
  >
    <slot />
  </NCard>
</template>

<style scoped>
/* redesign-v2：面板卡 = 大圆角 + 细边 + 柔和双层投影；subtle 变体保持扁平 */
.base-card { color: var(--color-text); }
.base-card--default.n-card,
.base-card--raised.n-card { box-shadow: var(--shadow-md); }
.base-card--fill-height {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.base-card--fill-height :deep(.n-card__content),
.base-card--fill-height :deep(.n-card-content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
}
</style>
