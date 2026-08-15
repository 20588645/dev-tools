<script setup lang="ts">
defineOptions({ name: 'PageTop' })
</script>

<template>
  <header class="page-top">
    <slot />
  </header>
</template>

<style scoped>
/* redesign-v2：页头区不再压表面色条，直接坐在渐变画布上 */
.page-top {
  flex: none;
  flex-shrink: 0;
  background: transparent;
  border-bottom: none;
}
</style>
