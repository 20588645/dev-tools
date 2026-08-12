<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { requestAddProject } from '@/legacy/add-project-bridge'

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

.seg__item {
  text-decoration: none;
}
</style>
