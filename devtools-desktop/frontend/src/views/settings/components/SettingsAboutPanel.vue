<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

import type { SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const { health, app } = props.controller
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsAboutTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsAboutTitle">关于</h2><p>版本、架构与本地数据位置</p></div>
      <span>DEVTOOLS DESKTOP</span>
    </div>

    <div class="settings-about-grid">
      <article><small>Version</small><strong>{{ health?.version || '0.1.93' }}</strong><p>macOS · Desktop</p></article>
      <article><small>Runtime</small><strong>Tauri 2</strong><p>Node Sidecar · SQLite</p></article>
      <article><small>Data</small><strong>Local First</strong><p>数据保存在当前设备</p></article>
    </div>
    <article class="settings-card settings-about-card">
      <div class="settings-row" data-setting-id="data-location" tabindex="-1">
        <span class="settings-row__copy"><strong>数据位置</strong><small>应用数据库与本地附件</small></span>
        <code :title="health?.dataDir">{{ health?.dataDir || '~/Library/Application Support/DevTools' }}</code>
      </div>
      <div class="settings-row" data-setting-id="about" tabindex="-1">
        <span class="settings-row__copy"><strong>运行端口</strong><small>当前 Sidecar HTTP / WebSocket 端口</small></span>
        <code>{{ app.sidecarPort || '未连接' }}</code>
      </div>
      <div class="settings-row">
        <span class="settings-row__copy"><strong>产品架构</strong><small>本地优先，不依赖云端同步</small></span>
        <BaseButton size="sm" variant="secondary" disabled>DevTools Desktop</BaseButton>
      </div>
    </article>
  </section>
</template>
