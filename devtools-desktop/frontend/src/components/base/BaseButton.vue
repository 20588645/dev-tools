<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
})

const type = computed<'primary' | 'default' | 'error'>(() => {
  if (props.variant === 'primary') return 'primary'
  if (props.variant === 'danger') return 'error'
  return 'default'
})

const variantProps = computed(() => ({
  secondary: props.variant === 'secondary',
  tertiary: props.variant === 'outline',
  quaternary: props.variant === 'ghost',
}))
</script>

<template>
  <NButton
    class="base-button"
    :class="[`base-button--${variant}`]"
    :type="type"
    :attr-type="props.type"
    :size="size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'medium'"
    :disabled="disabled || loading"
    :loading="loading"
    :aria-busy="loading || undefined"
    v-bind="variantProps"
  >
    <slot />
  </NButton>
</template>

<style scoped>
/* stylelint-disable declaration-no-important -- Naive 把 --n-height 写在根节点 inline style，必须盖住变量。 */
/* redesign-v2 方案 B：默认钮玻璃面 + 细边，主钮蓝紫渐变 + 彩色投影，悬停轻浮起。
   高度与输入/下拉同档：md 32 / sm 26 / lg 40。 */
.base-button {
  box-sizing: border-box;
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-semibold);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.base-button.n-button {
  border-radius: var(--component-control-radius);
}

.base-button.n-button.n-button--medium-type,
.base-button.n-button.n-button--small-type {
  --n-height: var(--component-control-height-md) !important;
  --n-font-size: var(--component-button-font-size) !important;
  --n-padding: 0 var(--component-button-padding-x) !important;
  --n-border-radius: var(--component-control-radius) !important;
  height: var(--component-control-height-md) !important;
  min-height: var(--component-control-height-md) !important;
  max-height: var(--component-control-height-md) !important;
  padding: 0 var(--component-button-padding-x) !important;
  border-radius: var(--component-control-radius);
  font-size: var(--component-button-font-size);
}

.base-button.n-button.n-button--large-type {
  --n-height: var(--component-control-height-lg) !important;
  height: var(--component-control-height-lg) !important;
  min-height: var(--component-control-height-lg) !important;
  max-height: var(--component-control-height-lg) !important;
}

.base-button.n-button :deep(.n-button__content) {
  font-size: inherit;
}

.base-button:not(:disabled):hover { transform: translateY(-1px); }

.base-button--primary.n-button {
  background-image: var(--color-action-gradient);
  box-shadow: var(--shadow-action);
}

.base-button--secondary.n-button,
.base-button--outline.n-button {
  background: var(--color-glass-strong);
  box-shadow: var(--shadow-sm);
}
</style>
