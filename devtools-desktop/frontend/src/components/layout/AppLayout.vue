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
/* stylelint-disable declaration-no-important --
   登记例外（P8 壳层）：折叠态需压制 styles/legacy/layout.css 的旧侧栏规则。
   G7 随 legacy 样式目录 token 化归零。 */
.app-layout-root {
  height: 100%;
  min-height: 100vh;
  --sidebar-width: 140px;
}

.app-layout-root .app-shell {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) !important;
}

.app-layout-root.is-collapsed .app-shell {
  grid-template-columns: 56px minmax(0, 1fr) !important;
}

.app-layout-root.is-collapsed .app-sidebar {
  width: 56px !important;
  min-width: 56px !important;
  max-width: 56px !important;
  padding-left: 7px !important;
  padding-right: 7px !important;
  align-items: center !important;
}

.app-layout-root.is-collapsed .sidebar-brand {
  padding-left: 0 !important;
  padding-right: 0 !important;
  justify-content: center !important;
}

.app-layout-root.is-collapsed .sidebar-nav,
.app-layout-root.is-collapsed .sidebar-footer {
  align-items: center !important;
}

.app-layout-root.is-collapsed .sidebar-item {
  width: 34px !important;
  min-width: 34px !important;
  padding: 0 !important;
  justify-content: center !important;
  gap: 0 !important;
}

.app-layout-root.is-collapsed .sidebar-brand span:last-child,
.app-layout-root.is-collapsed .sidebar-item span:last-child,
.app-layout-root.is-collapsed .sidebar-tool-label {
  display: none !important;
}

.app-layout-root:not(.is-collapsed) .app-sidebar .sidebar-footer {
  width: 100% !important;
  align-items: stretch !important;
  gap: 7px !important;
  padding: 12px 8px 0 !important;
}

.app-layout-root:not(.is-collapsed) .sidebar-tool-button {
  width: 100% !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  padding: 0 10px !important;
}

.app-layout-root.is-collapsed .app-sidebar .sidebar-footer {
  width: 100% !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 12px 0 0 !important;
}

.app-layout-root.is-collapsed .sidebar-tool-button {
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  height: 34px !important;
  justify-content: center !important;
  padding: 0 !important;
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
