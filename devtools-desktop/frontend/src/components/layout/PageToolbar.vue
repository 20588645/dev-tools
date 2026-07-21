<script setup lang="ts">
defineOptions({ name: 'PageToolbar' })
</script>

<template>
  <div class="page-toolbar">
    <slot />
  </div>
</template>

<style scoped>
.page-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--component-page-padding) var(--space-4);
}
</style>
