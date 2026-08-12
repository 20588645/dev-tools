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
