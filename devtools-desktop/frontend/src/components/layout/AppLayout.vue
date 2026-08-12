<script setup lang="ts">
import { computed } from 'vue'

import AppSidebar from './AppSidebar.vue'

const props = withDefaults(
  defineProps<{
    activePageId?: string
    collapsed?: boolean
    brandNote?: string
    contentClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
  }>(),
  {
    activePageId: 'home',
    collapsed: false,
    brandNote: '',
    contentClass: undefined,
  },
)

const emit = defineEmits<{
  navigate: [pageId: string, path: string]
  'update:collapsed': [value: boolean]
  intro: []
}>()

const rootClass = computed(() => ({
  'app-layout-root': true,
  'is-collapsed': props.collapsed,
}))
</script>

<template>
  <div :class="rootClass" :style="{ '--sidebar-width': collapsed ? '56px' : '140px' }">
    <div class="app-shell">
      <AppSidebar
        :active-page-id="activePageId"
        :collapsed="collapsed"
        @navigate="(pageId, path) => emit('navigate', pageId, path)"
        @update:collapsed="(value) => emit('update:collapsed', value)"
        @intro="emit('intro')"
      />
      <div class="app-main">
        <div class="window-drag-region" data-tauri-drag-region aria-hidden="true" />
        <main class="main-content" :class="contentClass" data-test="app-main-content">
          <slot>
            <section class="app-layout-placeholder">
              <h1 class="page-title">AppLayout 预览</h1>
              <p class="page-subtitle">当前页：{{ activePageId }}</p>
              <p v-if="brandNote" class="app-layout-note">{{ brandNote }}</p>
            </section>
          </slot>
        </main>
      </div>
    </div>
  </div>
</template>

<style>
/* P9-8：!important 全部移除。styles/legacy/layout.css 的旧壳层规则已去 important，
   本组件的折叠态覆盖靠 .app-layout-root.is-collapsed 前缀的更高特异性生效。 */
.app-layout-root {
  height: 100%;
  min-height: 100vh;
  --sidebar-width: 140px;
}

.app-layout-root .app-shell {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
}

.app-layout-root.is-collapsed .app-shell {
  grid-template-columns: 56px minmax(0, 1fr);
}

.app-layout-root.is-collapsed .app-sidebar {
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  padding-left: 7px;
  padding-right: 7px;
  align-items: center;
}

.app-layout-root.is-collapsed .sidebar-brand {
  padding-left: 0;
  padding-right: 0;
  justify-content: center;
}

.app-layout-root.is-collapsed .sidebar-nav,
.app-layout-root.is-collapsed .sidebar-footer {
  align-items: center;
}

.app-layout-root.is-collapsed .sidebar-item {
  width: 34px;
  min-width: 34px;
  padding: 0;
  justify-content: center;
  gap: 0;
}

.app-layout-root.is-collapsed .sidebar-brand span:last-child,
.app-layout-root.is-collapsed .sidebar-item span:last-child,
.app-layout-root.is-collapsed .sidebar-tool-label {
  display: none;
}

.app-layout-root:not(.is-collapsed) .app-sidebar .sidebar-footer {
  width: 100%;
  align-items: stretch;
  gap: 7px;
  padding: 12px 8px 0;
}

.app-layout-root:not(.is-collapsed) .sidebar-tool-button {
  width: 100%;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 10px;
}

.app-layout-root.is-collapsed .app-sidebar .sidebar-footer {
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px 0 0;
}

.app-layout-root.is-collapsed .app-sidebar .sidebar-footer .sidebar-tool-button {
  width: 34px;
  min-width: 34px;
  max-width: 34px;
  height: 34px;
  justify-content: center;
  padding: 0;
}

.app-layout-placeholder {
  padding: 28px 24px;
}

.app-layout-note {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
