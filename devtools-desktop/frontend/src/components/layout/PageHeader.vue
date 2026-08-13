<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), { description: undefined })
</script>

<template>
  <div class="page-header">
    <div class="page-header__identity">
      <div v-if="$slots.icon" class="page-header__icon" aria-hidden="true">
        <slot name="icon" />
      </div>
      <div class="page-header__copy">
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 72px;
  padding: var(--space-4) var(--component-page-padding);
}

.page-header__identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
}

.page-header__icon {
  display: grid;
  flex: none;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--color-action);
  background: var(--color-surface-subtle);
  border-radius: var(--radius-md);
}

.page-header__copy {
  min-width: 0;
}

/* redesign-v2 页头排版：21px/750/-0.3px 主标题 + 12.5px 弱化副题 */
h1 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-xl);
  font-weight: 750;
  letter-spacing: -0.3px;
  line-height: var(--line-height-tight);
}

p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-subtle);
  font-size: 12.5px;
  line-height: var(--line-height-normal);
}

.page-header__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
}

@media (max-width: 720px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-header__actions {
    width: 100%;
  }
}
</style>
