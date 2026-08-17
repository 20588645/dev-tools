<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { requestAddProject } from '@/views/deploy/add-project-events'

defineOptions({ name: 'DeployChrome' })

const route = useRoute()
const activeSub = computed(() => String(route.meta.deploySub ?? 'dashboard'))

const tabs = [
  { sub: 'dashboard', path: '/deploy/dashboard', label: '项目总览' },
  { sub: 'servers', path: '/deploy/servers', label: '服务器管理' },
  { sub: 'history', path: '/deploy/history', label: '部署历史' },
] as const
</script>

<template>
  <PageFrame class="deploy-chrome" data-test="deploy-chrome">
    <template #top>
      <PageTop>
        <PageHeader title="部署面板" description="项目构建与 SFTP 部署管理">
          <template #icon>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
            </svg>
          </template>
          <template #actions>
            <BaseButton variant="primary" @click="requestAddProject()">＋ 添加项目</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <!-- 原型页头 .seg：三个子页在同一分段器里切换 -->
          <nav class="deploy-chrome__tabs" role="tablist" aria-label="部署子页">
            <RouterLink
              v-for="tab in tabs"
              :key="tab.sub"
              :to="tab.path"
              class="deploy-chrome__tab"
              :class="{ 'is-active': activeSub === tab.sub }"
              role="tab"
              :aria-selected="activeSub === tab.sub"
            >
              {{ tab.label }}
            </RouterLink>
          </nav>
        </PageToolbar>
        <PageToolbar v-if="$slots.toolbar">
          <slot name="toolbar" />
        </PageToolbar>
      </PageTop>
    </template>
    <slot />
  </PageFrame>
</template>

<style scoped>
/* redesign-v2 分段器视觉（与 BaseSegmented 同语言）：淡色槽 + 白面浮起活块 */
.deploy-chrome__tabs {
  display: inline-flex;
  align-items: stretch;
  box-sizing: border-box;
  height: var(--component-control-height-md);
  min-height: var(--component-control-height-md);
  gap: 2px;
  padding: 3px;
  background: var(--color-surface-subtle);
  border-radius: var(--component-control-radius);
}

.deploy-chrome__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--component-control-height-md) - 6px);
  min-height: calc(var(--component-control-height-md) - 6px);
  padding: 0 var(--space-3);
  border-radius: calc(var(--component-control-radius) - 3px);
  color: var(--color-text-muted);
  font-size: var(--component-button-font-size);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
}

.deploy-chrome__tab:hover {
  color: var(--color-text);
}

.deploy-chrome__tab.is-active {
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent);
}
</style>
