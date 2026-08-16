<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), { description: undefined })
</script>

<template>
  <div class="page-header">
    <div class="page-header__identity">
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
/* 原型 .page-head：标题与副题底对齐同一行，无图标方块 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 56px;
  padding: var(--space-5) var(--component-page-padding) var(--space-3);
}

.page-header__identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
}

.page-header__copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 14px;
}

/* redesign-v2 页头排版：21px/750/-0.3px 主标题 + 12.5px 弱化副题 */
h1 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-xl);
  font-weight: 750;
  letter-spacing: -0.3px;
  line-height: var(--line-height-tight);
  white-space: nowrap;
}

p {
  overflow: hidden;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12.5px;
  line-height: var(--line-height-normal);
  text-overflow: ellipsis;
  white-space: nowrap;
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

  .page-header__copy {
    flex-wrap: wrap;
    gap: 2px 14px;
  }

  .page-header__actions {
    width: 100%;
  }
}
</style>
