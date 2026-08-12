<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
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
  <div class="deploy-chrome page has-fixed-header" data-test="deploy-chrome">
    <div class="page-fixed-header">
      <div class="page-header-bar page-header-simple">
        <div>
          <div class="page-title">部署面板</div>
          <div class="page-subtitle">项目构建与 SFTP 部署管理</div>
        </div>
        <div class="page-header-actions">
          <BaseButton @click="requestAddProject()">+ 添加项目</BaseButton>
        </div>
      </div>
      <div class="page-toolbar">
        <div class="seg" role="tablist" aria-label="部署子页">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.sub"
            :to="tab.path"
            class="seg__item"
            :class="{ 'is-active': activeSub === tab.sub }"
            role="tab"
            :aria-selected="activeSub === tab.sub"
          >
            {{ tab.label }}
          </RouterLink>
        </div>
      </div>
    </div>
    <div class="page-scroll-body deploy-chrome__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* L3（legacy token 化）：页头与分段切换视觉自 styles/legacy 收编自持。 */
.deploy-chrome {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
}

.deploy-chrome__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.page-header-bar.page-header-simple {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  margin-bottom: var(--space-3);
  padding: 0;
}

.page-title {
  margin: 0 0 4px;
  color: var(--color-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.01em;
  line-height: 1.25;
}

.page-subtitle {
  margin: 2px 0 0;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.page-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 36px;
  margin-bottom: 14px;
}

.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.seg__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 13px;
  border: none;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
}

.seg__item:hover { color: var(--color-text); }

.seg__item.is-active {
  background: var(--color-surface);
  color: var(--color-action);
  box-shadow: var(--shadow-sm);
}
</style>
