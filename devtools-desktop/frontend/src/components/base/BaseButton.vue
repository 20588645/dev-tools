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
/* redesign-v2 方案 B：默认钮玻璃面 + 细边，主钮蓝紫渐变 + 彩色投影，悬停轻浮起 */
.base-button {
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-semibold);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.base-button.n-button { border-radius: var(--component-control-radius); }

.base-button:not(:disabled):hover { transform: translateY(-1px); }

.base-button--primary.n-button {
  background-image: var(--color-action-gradient);
  box-shadow: 0 8px 20px -6px color-mix(in srgb, var(--color-action) 55%, transparent);
}

.base-button--secondary.n-button,
.base-button--outline.n-button {
  background: var(--color-glass-strong);
  box-shadow: var(--shadow-sm);
}
</style>
