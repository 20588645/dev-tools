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
/* stylelint-disable declaration-no-important -- Naive 把 --n-height 写在根节点 inline style，必须盖住变量。 */
/* 图标钮与同档文字钮同高：sm 26 / md 32 / lg 40 */
.base-icon-button { flex: none; box-sizing: border-box; }

.base-icon-button.n-button { border-radius: calc(var(--component-control-radius) - 2px); }

.base-icon-button.n-button.n-button--small-type {
  --n-height: var(--component-control-height-sm) !important;
  width: var(--component-control-height-sm) !important;
  min-width: var(--component-control-height-sm) !important;
  height: var(--component-control-height-sm) !important;
}

.base-icon-button.n-button.n-button--medium-type {
  --n-height: var(--component-control-height-md) !important;
  width: var(--component-control-height-md) !important;
  min-width: var(--component-control-height-md) !important;
  height: var(--component-control-height-md) !important;
}

.base-icon-button.n-button.n-button--large-type {
  --n-height: var(--component-control-height-lg) !important;
  width: var(--component-control-height-lg) !important;
  min-width: var(--component-control-height-lg) !important;
  height: var(--component-control-height-lg) !important;
}
</style>
