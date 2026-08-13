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
  <div :class="rootClass">
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
/* L2（legacy token 化）：壳层容器几何与 main 区自 styles/legacy/layout.css 移入自持。
   折叠态覆盖靠 .app-layout-root.is-collapsed 前缀的更高特异性生效。 */
.app-layout-root {
  height: 100%;
  min-height: 100vh;
  --sidebar-width: 224px;
}

.app-layout-root.is-collapsed {
  --sidebar-width: 56px;
}

/* 过渡期：未按 redesign-v2 重建的页面在窄窗下仍按旧内容宽度布局，
   收窄侧栏避免横向溢出；页面批次全部落地后可回归原型的固定 224px。 */
@media (max-width: 1080px) {
  .app-layout-root:not(.is-collapsed) {
    --sidebar-width: 150px;
  }
}

.app-shell {
  display: grid;
  height: 100vh;
  padding-top: 0;
  background: transparent;
  transition: grid-template-columns 0.18s ease;
}

.app-layout-root .app-shell {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
}

.app-layout-root.is-collapsed .app-shell {
  grid-template-columns: 56px minmax(0, 1fr);
}

.app-main {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100vh;
  min-width: 0;
  margin-left: 0;
  overflow: hidden;
  background: transparent;
}

.window-drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  height: 30px;
  -webkit-app-region: drag;
}

.main-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100vh;
  max-width: none;
  box-sizing: border-box;
  padding: 36px 28px 22px;
  overflow: auto;
  background: transparent;
  scroll-behavior: auto;
}

@media (max-width: 980px) {
  .main-content { padding: 34px 18px 20px; }
}

.main-content.home-active {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 30px 0 0;
  box-sizing: border-box;
  overflow: hidden;
}

.app-layout-root.is-collapsed .app-sidebar {
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  padding-left: 8px;
  padding-right: 8px;
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

.app-layout-root.is-collapsed .sidebar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
}

.app-layout-root.is-collapsed .sidebar-item {
  width: 36px;
  min-width: 36px;
  padding: 0;
  height: 36px;
  justify-content: center;
  gap: 0;
}

.app-layout-root.is-collapsed .sidebar-group-label,
.app-layout-root.is-collapsed .brand-name,
.app-layout-root.is-collapsed .sidebar-item .nav-label,
.app-layout-root.is-collapsed .sidebar-tool-label {
  display: none;
}

.app-layout-root.is-collapsed .app-sidebar .sidebar-footer {
  flex-direction: column;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 10px 0 0;
}

.app-layout-root.is-collapsed .app-sidebar .sidebar-footer .sidebar-tool-button {
  flex: none;
  width: 36px;
  min-width: 36px;
  max-width: 36px;
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
  color: var(--color-text-muted);
}
</style>
