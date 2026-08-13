<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { MENU_ORDER_CHANGED_EVENT } from '@/services/app-events'
import { readMenuOrder } from '@/services/modules/settings-service'
import { useAppStore } from '@/stores/app'

import { resolveSidebarNavGroups, type SidebarNavItemModel } from './sidebar-nav'

const props = withDefaults(
  defineProps<{
    activePageId?: string
    collapsed?: boolean
    syncMenuOrder?: boolean
    enableThemeToggle?: boolean
  }>(),
  {
    activePageId: 'home',
    collapsed: false,
    syncMenuOrder: true,
    enableThemeToggle: true,
  },
)

const emit = defineEmits<{
  navigate: [pageId: string, path: string]
  'update:collapsed': [value: boolean]
  intro: []
}>()

const app = useAppStore()
const menuOrderTick = ref(0)

const groups = computed(() => {
  void menuOrderTick.value
  return resolveSidebarNavGroups(readMenuOrder())
})

const themeIcon = computed(() => {
  if (app.themeMode === 'system') return '◐'
  return app.theme === 'dark' ? '☾' : '☀'
})

const themeTitle = computed(() => {
  if (app.themeMode === 'system') {
    return `外观：跟随系统（当前${app.theme === 'dark' ? '暗色' : '亮色'}）· 点击切换`
  }
  return `外观：${app.theme === 'dark' ? '暗色' : '亮色'}模式 · 点击切换`
})

function refreshMenuOrder() {
  menuOrderTick.value += 1
}

function onNavigate(item: SidebarNavItemModel) {
  emit('navigate', item.pageId, item.path)
}

function toggleCollapse() {
  emit('update:collapsed', !props.collapsed)
}

function cycleTheme() {
  if (!props.enableThemeToggle) return
  app.toggleTheme()
}

function openIntro() {
  emit('intro')
}

onMounted(() => {
  if (!props.syncMenuOrder) return
  window.addEventListener(MENU_ORDER_CHANGED_EVENT, refreshMenuOrder)
})

onUnmounted(() => {
  window.removeEventListener(MENU_ORDER_CHANGED_EVENT, refreshMenuOrder)
})

watch(
  () => props.syncMenuOrder,
  (enabled) => {
    if (enabled) refreshMenuOrder()
  },
)
</script>

<template>
  <aside class="app-sidebar" data-tauri-drag-region="deep">
    <div class="sidebar-brand">
      <span class="brand-mark">⌘</span>
      <span class="brand-name">DevTools</span>
    </div>

    <nav class="sidebar-nav" aria-label="主导航">
      <div v-for="group in groups" :key="group.id" class="sidebar-group">
        <div class="sidebar-group-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.pageId"
          type="button"
          class="sidebar-item"
          :class="{ active: item.pageId === activePageId }"
          :data-page="item.pageId"
          :title="item.title"
          @click="onNavigate(item)"
        >
          <span class="nav-icon" v-html="item.iconSvg" />
          <span class="nav-label">{{ item.title }}</span>
        </button>
      </div>
    </nav>

    <div class="sidebar-footer">
      <button
        type="button"
        class="sidebar-tool-button"
        title="项目介绍"
        @click="openIntro"
      >
        <span class="sidebar-tool-icon">ⓘ</span>
        <span class="sidebar-tool-label">介绍</span>
      </button>
      <button
        type="button"
        class="sidebar-tool-button"
        data-test="theme-toggle"
        :title="themeTitle"
        :disabled="!enableThemeToggle"
        :aria-label="themeTitle"
        @click="cycleTheme"
      >
        <span class="sidebar-tool-icon">{{ themeIcon }}</span>
        <span class="sidebar-tool-label">外观</span>
      </button>
      <button
        type="button"
        class="sidebar-tool-button sidebar-collapse-toggle"
        :title="collapsed ? '展开侧栏' : '折叠侧栏'"
        @click="toggleCollapse"
      >
        <span class="sidebar-tool-icon sidebar-collapse-icon">{{ collapsed ? '›' : '‹' }}</span>
        <span class="sidebar-tool-label sidebar-collapse-label">收起</span>
      </button>
    </div>
  </aside>
</template>

<style>
/* redesign-v2 方案 B：毛玻璃分组侧栏（非 scoped：与迁移前的全局层叠语义一致；
   折叠态由 AppLayout 的 .app-layout-root.is-collapsed 前缀驱动）。 */
.app-sidebar {
  position: relative;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  max-width: var(--sidebar-width);
  height: 100vh;
  min-height: 100vh;
  padding: 42px 12px 12px;
  overflow: hidden;
  border: 0;
  border-right: 1px solid var(--color-border-soft);
  border-radius: 0;
  background: var(--color-glass);
  backdrop-filter: var(--component-glass-blur);
  -webkit-backdrop-filter: var(--component-glass-blur);
  box-shadow: none;
  user-select: none;
  -webkit-app-region: drag;
  transition: width 0.18s ease, min-width 0.18s ease, padding 0.18s ease;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 10px 16px;
  overflow: hidden;
  color: var(--color-text);
}

.brand-mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-action-contrast);
  background: var(--color-action-gradient);
  border-radius: 9px;
  box-shadow: 0 4px 12px -2px color-mix(in srgb, var(--color-action) 50%, transparent);
}

.brand-name {
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -webkit-app-region: no-drag;
}

.sidebar-nav::-webkit-scrollbar { display: none; }

.sidebar-group { margin-bottom: 14px; }

.sidebar-group-label {
  padding: 0 10px 6px;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--color-text-subtle);
}

.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  box-shadow: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  overflow: visible;
  transform: none;
  transition: background 0.12s, color 0.12s;
}

.sidebar-item:hover {
  background: var(--color-surface-subtle);
  color: var(--color-text);
}

.sidebar-item.active {
  font-weight: 600;
  background: var(--color-action-gradient);
  color: var(--color-action-contrast);
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--color-action) 55%, transparent);
}

.sidebar-item .nav-label {
  display: inline;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item .nav-icon,
.sidebar-item .nav-icon svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.sidebar-item .nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: currentcolor;
  opacity: 0.9;
}

.sidebar-item .nav-icon svg { stroke-width: 1.8; }

.sidebar-footer {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  gap: 6px;
  padding: 10px 0 0;
  border-top: 1px solid var(--color-border-soft);
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.sidebar-tool-button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 32px;
  gap: 6px;
  padding: 0 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  box-shadow: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: background 0.12s, color 0.12s;
  -webkit-app-region: no-drag;
}

.sidebar-tool-button:hover {
  color: var(--color-text);
  background: var(--color-surface-subtle);
}

.sidebar-tool-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  min-width: 16px;
  line-height: 1;
}

.sidebar-tool-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-collapse-icon {
  font-size: 15px;
  line-height: 1;
}
</style>
