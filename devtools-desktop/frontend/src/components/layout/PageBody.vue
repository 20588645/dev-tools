<script setup lang="ts">
defineOptions({ name: 'PageBody' })
</script>

<template>
  <main class="page-body"><slot /></main>
</template>

<style scoped>
.page-body {
  flex: 1;
  min-height: 0;
  padding: var(--component-page-padding);
}
</style>
