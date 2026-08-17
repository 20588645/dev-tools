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
/* 图标钮与同档文字钮同高：sm 26 / md 32 / lg 40 */
.base-icon-button { flex: none; box-sizing: border-box; }

.base-icon-button.n-button { border-radius: calc(var(--component-control-radius) - 2px); }

.base-icon-button.n-button.n-button--small-type {
  width: var(--component-control-height-sm);
  min-width: var(--component-control-height-sm);
  height: var(--component-control-height-sm);
}

.base-icon-button.n-button.n-button--medium-type {
  width: var(--component-control-height-md);
  min-width: var(--component-control-height-md);
  height: var(--component-control-height-md);
}

.base-icon-button.n-button.n-button--large-type {
  width: var(--component-control-height-lg);
  min-width: var(--component-control-height-lg);
  height: var(--component-control-height-lg);
}
</style>
