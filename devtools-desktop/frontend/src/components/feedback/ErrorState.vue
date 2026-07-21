<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), { title: '加载失败', description: '请稍后重试。' })

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="error-state" role="alert">
    <div class="error-state__icon" aria-hidden="true">!</div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <button type="button" @click="$emit('retry')">重新加载</button>
  </div>
</template>

<style scoped>
.error-state { display: grid; justify-items: center; gap: var(--space-2); min-height: 160px; padding: var(--space-8); text-align: center; }
.error-state__icon { display: grid; width: 32px; height: 32px; place-items: center; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 14%, transparent); border-radius: var(--radius-pill); font-weight: var(--font-weight-bold); }
h2 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); }
p { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
button { min-height: var(--component-control-height-sm); padding: 0 var(--space-3); color: var(--color-action); background: transparent; border: 1px solid var(--color-border); border-radius: var(--component-control-radius); cursor: pointer; }
button:hover { border-color: var(--color-action); }
button:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
</style>
