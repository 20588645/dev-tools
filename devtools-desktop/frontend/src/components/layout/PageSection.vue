<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
}>(), { title: undefined })
</script>

<template>
  <section class="page-section">
    <div v-if="title || $slots.actions" class="page-section__header">
      <h2 v-if="title">{{ title }}</h2>
      <div v-if="$slots.actions" class="page-section__actions"><slot name="actions" /></div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.page-section {
  display: grid;
  gap: var(--space-3);
}

.page-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}
</style>
