<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'

import type { SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const emit = defineEmits<{ 'request-kill-test': [] }>()
const { showTestSidecars, testSidecarPids, operation } = props.controller
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsAdvancedTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsAdvancedTitle">高级</h2><p>开发工具和高影响系统操作</p></div>
      <span>CAUTION</span>
    </div>

    <article class="settings-danger-zone" data-setting-id="upgrade" tabindex="-1">
      <div><h3>重新打包并更新应用</h3><p>本地编译最新代码、覆盖 Applications 中的程序并自动重启。任务开始后请勿退出。</p></div>
      <BaseButton variant="danger" @click="controller.requestUpgrade">检查并更新</BaseButton>
    </article>

    <article v-if="showTestSidecars" class="settings-card settings-test-sidecar" data-setting-id="test-sidecar" tabindex="-1">
      <header class="settings-card__heading">
        <h3>开发环境</h3><BaseBadge tone="warning">仅测试环境可见</BaseBadge>
      </header>
      <div class="settings-row">
        <span class="settings-row__copy">
          <strong>测试 Sidecar</strong>
          <small>13900 · 独立 data-test 数据库</small>
        </span>
        <div class="settings-inline-control">
          <BaseBadge :tone="testSidecarPids.length ? 'success' : 'neutral'">{{ testSidecarPids.length }} 个进程</BaseBadge>
          <BaseButton
            size="sm"
            variant="danger"
            :disabled="!testSidecarPids.length"
            :loading="operation.testSidecarKill === 'working'"
            @click="emit('request-kill-test')"
          >停止</BaseButton>
        </div>
      </div>
    </article>
  </section>
</template>
