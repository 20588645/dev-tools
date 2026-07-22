<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'

const props = withDefaults(defineProps<{
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'outline' | 'danger'
  disabled?: boolean
}>(), {
  size: 'md',
  variant: 'ghost',
  disabled: false,
})

const type = computed<'error' | 'default'>(() => props.variant === 'danger' ? 'error' : 'default')
</script>

<template>
  <NButton
    class="base-icon-button"
    :class="[`base-icon-button--${variant}`]"
    :type="type"
    :size="size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'medium'"
    :quaternary="variant === 'ghost'"
    :tertiary="variant === 'outline'"
    :circle="true"
    :disabled="disabled"
    :aria-label="label"
  >
    <slot />
  </NButton>
</template>

<style scoped>
.base-icon-button { flex: none; }
</style>
