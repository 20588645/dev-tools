<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { MENU_ORDER_CHANGED_EVENT } from '@/services/app-events'
import { readMenuOrder } from '@/services/modules/settings-service'
import { useAppStore } from '@/stores/app'

import { resolveSidebarNavItems, type SidebarNavItemModel } from './sidebar-nav'

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

const items = computed(() => {
  void menuOrderTick.value
  return resolveSidebarNavItems(readMenuOrder())
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
      <span class="brand-icon">⌘</span>
      <span>DevTools</span>
    </div>

    <nav class="sidebar-nav" aria-label="主导航">
      <button
        v-for="item in items"
        :key="item.pageId"
        type="button"
        class="sidebar-item"
        :class="{ active: item.pageId === activePageId }"
        :data-page="item.pageId"
        :title="item.title"
        @click="onNavigate(item)"
      >
        <span class="nav-icon" v-html="item.iconSvg" />
        <span>{{ item.title }}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        type="button"
        class="theme-toggle sidebar-tool-button"
        title="项目介绍"
        @click="openIntro"
      >
        <span class="sidebar-tool-icon">i</span>
        <span class="sidebar-tool-label">介绍</span>
      </button>
      <button
        type="button"
        class="theme-toggle sidebar-tool-button"
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
        class="theme-toggle sidebar-tool-button sidebar-collapse-toggle"
        :title="collapsed ? '展开侧栏' : '折叠侧栏'"
        @click="toggleCollapse"
      >
        <span class="sidebar-tool-icon sidebar-collapse-icon">{{ collapsed ? '›' : '‹' }}</span>
        <span class="sidebar-tool-label sidebar-collapse-label">{{ collapsed ? '展开' : '收起' }}</span>
      </button>
    </div>
  </aside>
</template>

<style>
/* L2（legacy token 化）：侧栏视觉自 styles/legacy/layout.css 移入自持。
   非 scoped：与迁移前的全局层叠语义一致；折叠态由 .app-layout-root.is-collapsed 前缀驱动。 */
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
  padding: 44px 8px 12px;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(24px) saturate(130%);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  box-shadow: none;
  user-select: none;
  -webkit-app-region: drag;
  transition: width 0.18s ease, min-width 0.18s ease, padding 0.18s ease;
}

.app-sidebar::after {
  content: "";
  position: absolute;
  top: 58px;
  right: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-border);
  pointer-events: none;
}

.app-layout-root.is-collapsed .app-sidebar::after {
  top: 64px;
}

@media (max-height: 700px) {
  .app-sidebar .sidebar-nav {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .app-sidebar .sidebar-nav::-webkit-scrollbar {
    display: none;
  }

  .app-sidebar .sidebar-footer {
    flex-shrink: 0;
  }
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 24px;
  min-width: 0;
  padding: 0 7px 14px;
  overflow: hidden;
  color: var(--color-text);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0;
}

.sidebar-brand span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  font-size: 10px;
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 5px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  flex: 1;
  gap: 7px;
  padding: 0;
  -webkit-app-region: no-drag;
}

.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 34px;
  min-height: 34px;
  min-width: 0;
  gap: 10px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  box-shadow: none;
  font-family: inherit;
  font-size: 11px;
  font-weight: 560;
  text-align: left;
  cursor: pointer;
  overflow: visible;
  transform: none;
  transition: all 0.12s;
}

.sidebar-item:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.sidebar-item.active {
  font-weight: 650;
  background: color-mix(in srgb, var(--color-action) 11%, transparent);
  color: var(--color-action);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-action) 20%, transparent);
}

.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: var(--color-action);
  animation: indicatorIn 0.2s ease;
}

.sidebar-item span:last-child {
  display: inline;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.sidebar-item .nav-icon,
.sidebar-item .nav-icon svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
}

.sidebar-item .nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: currentcolor;
  font-size: 15px;
  text-align: center;
}

.sidebar-item .nav-icon svg { stroke-width: 2; }

.sidebar-footer {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 7px;
  padding: 12px 8px 0;
  border-top: 1px solid var(--color-border);
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-subtle);
  font-size: 12px;
  box-shadow: none;
  cursor: pointer;
  transition: all 0.12s;
  -webkit-app-region: no-drag;
}

.theme-toggle:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
  border-color: transparent;
}

.sidebar-tool-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 32px;
  min-height: 32px;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 620;
  box-sizing: border-box;
}

.sidebar-tool-button:hover {
  color: var(--color-text);
  background: var(--color-surface-hover);
  border-color: var(--color-border);
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

.sidebar-collapse-toggle {
  font-size: 18px;
  line-height: 1;
}
</style>
