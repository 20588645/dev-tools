<script setup lang="ts">
/**
 * redesign-v2 常驻参考侧栏：写作/编辑时需要边看边抄的内容（如工时页 Git 活动参考）
 * 用第三栏面板承载，禁止用会遮挡编辑区的弹窗；可由页头按钮收起（v-model:collapsed）。
 */
withDefaults(defineProps<{
  title: string
  subtitle?: string
  width?: string
  collapsed?: boolean
}>(), {
  subtitle: undefined,
  width: '300px',
  collapsed: false,
})

defineEmits<{ 'update:collapsed': [value: boolean] }>()
</script>

<template>
  <aside
    v-show="!collapsed"
    class="side-panel"
    :style="{ width, minWidth: width }"
    :aria-label="title"
  >
    <div class="side-panel__head">
      <div class="side-panel__heading">
        <span class="side-panel__title">{{ title }}</span>
        <span v-if="subtitle" class="side-panel__subtitle">{{ subtitle }}</span>
      </div>
      <div v-if="$slots.actions" class="side-panel__actions"><slot name="actions" /></div>
    </div>
    <div class="side-panel__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="side-panel__footer"><slot name="footer" /></div>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex: none;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--component-card-radius);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.side-panel__head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  padding: 13px 16px 9px;
}

.side-panel__heading {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.side-panel__title {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.side-panel__subtitle {
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel__actions {
  display: flex;
  flex: none;
  gap: var(--space-1);
  align-items: center;
  margin-left: auto;
}

.side-panel__body {
  flex: 1;
  min-height: 0;
  padding: 0 16px 12px;
  overflow-y: auto;
}

.side-panel__footer {
  flex: none;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--color-border-soft);
}
</style>
