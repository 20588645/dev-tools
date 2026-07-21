<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'raised' | 'subtle'
  interactive?: boolean
}>(), {
  variant: 'default',
  interactive: false,
})
</script>

<template>
  <article class="base-card" :class="[`base-card--${variant}`, { 'base-card--interactive': interactive }]">
    <slot />
  </article>
</template>

<style scoped>
.base-card {
  padding: var(--component-card-padding);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--component-card-radius);
}

.base-card--raised { background: var(--color-surface-raised); box-shadow: var(--shadow-sm); }
.base-card--subtle { background: var(--color-surface-subtle); border-color: transparent; }
.base-card--interactive { transition: border-color var(--duration-normal) var(--ease-standard), transform var(--duration-normal) var(--ease-standard); }
.base-card--interactive:hover { border-color: var(--color-border-strong); transform: translateY(-1px); }
</style>
