<script setup lang="ts">
defineOptions({ name: 'PageTop' })
</script>

<template>
  <header class="page-top">
    <slot />
  </header>
</template>

<style scoped>
.page-top {
  flex: none;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
</style>
