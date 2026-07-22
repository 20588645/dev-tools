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
.base-button { font-family: var(--font-family-sans); font-weight: var(--font-weight-medium); }
</style>
