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
  <!-- danger 也走 quaternary：原型删除类操作是红字透明底，不用红实底方块 -->
  <NButton
    class="base-icon-button"
    :class="[`base-icon-button--${variant}`]"
    :type="type"
    :size="size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'medium'"
    :quaternary="variant === 'ghost' || variant === 'danger'"
    :tertiary="variant === 'outline'"
    :circle="true"
    :disabled="disabled"
    :aria-label="label"
  >
    <slot />
  </NButton>
</template>

<style scoped>
/* redesign-v2：圆角方形图标钮（28px / 圆角 8），悬停淡底 */
.base-icon-button { flex: none; }

.base-icon-button.n-button { border-radius: calc(var(--component-control-radius) - 2px); }
</style>
