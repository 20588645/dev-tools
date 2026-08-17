<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'

import { formatSidecarUptime, type SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const emit = defineEmits<{
  'request-restart': []
  'request-reset-menu': []
}>()
const {
  health,
  nodeRuntime,
  sidecarLabel,
  connectionTimeoutDraft,
  settingsStore,
  operation,
  menuItems,
} = props.controller

const nodeRuntimeCaption = computed(() => {
  const versions = nodeRuntime.value?.versions ?? []
  if (versions.length > 1) return `已安装 ${versions.length} 个版本`
  return '当前 Sidecar 运行环境'
})
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsGeneralTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsGeneralTitle">常规</h2><p>本地服务、连接参数与侧边栏顺序</p></div>
      <span>LOCAL / {{ health ? 'READY' : 'OFFLINE' }}</span>
    </div>

    <div class="settings-panel-grid">
      <article class="settings-card">
        <header class="settings-card__heading">
          <h3><i class="settings-live-dot" :class="{ 'is-online': Boolean(health) }" />运行与连接</h3>
          <BaseBadge :tone="health ? 'success' : 'danger'">{{ health ? '运行中' : '离线' }}</BaseBadge>
        </header>
        <div class="settings-card__body">
          <div class="settings-row" data-setting-id="sidecar" tabindex="-1">
            <span class="settings-row__copy"><strong>Sidecar 服务</strong><small>{{ health?.pid ? `PID ${health.pid} · ${sidecarLabel}` : sidecarLabel }}</small></span>
            <BaseButton
              size="sm"
              variant="secondary"
              :loading="operation.restart === 'working'"
              @click="emit('request-restart')"
            >重启</BaseButton>
          </div>
          <div class="settings-row" data-setting-id="timeout" tabindex="-1">
            <span class="settings-row__copy"><strong>连接超时</strong><small>SSH 与远程操作，范围 5–300 秒</small></span>
            <div class="settings-inline-control">
              <BaseInput
                :model-value="String(connectionTimeoutDraft)"
                type="number"
                aria-label="连接超时秒数"
                :disabled="settingsStore.saving"
                @update:model-value="connectionTimeoutDraft = Number($event)"
                @blur="controller.saveConnectionTimeout"
              />
              <span>秒</span>
            </div>
          </div>
          <div class="settings-row" data-setting-id="node" tabindex="-1">
            <span class="settings-row__copy"><strong>Node 版本</strong><small>{{ nodeRuntimeCaption }}</small></span>
            <code>{{ nodeRuntime?.current || nodeRuntime?.versions[0] || '未读取' }}</code>
          </div>
          <div class="settings-row" data-setting-id="scan" tabindex="-1">
            <span class="settings-row__copy"><strong>项目扫描目录</strong><small>只读运行信息</small></span>
            <code>~/project</code>
          </div>
        </div>
        <footer class="settings-card__meta">
          <div>
            <small>运行时长</small>
            <strong>{{ health ? formatSidecarUptime(health.uptime) : '—' }}</strong>
          </div>
          <div>
            <small>Sidecar 版本</small>
            <strong>{{ health?.version || '—' }}</strong>
          </div>
          <div>
            <small>数据目录</small>
            <strong :title="health?.dataDir">{{ health?.dataDir || '—' }}</strong>
          </div>
        </footer>
      </article>

      <article class="settings-card settings-menu-card" data-setting-id="menu" tabindex="-1">
        <header class="settings-card__heading">
          <h3>侧边栏顺序</h3>
          <BaseButton size="sm" variant="ghost" @click="emit('request-reset-menu')">恢复默认</BaseButton>
        </header>
        <div class="settings-menu-order">
          <div class="settings-menu-item is-fixed">
            <span class="settings-menu-item__index">01</span>
            <strong>应用首页</strong><BaseBadge>固定</BaseBadge>
          </div>
          <div
            v-for="(item, index) in menuItems"
            :key="item.page"
            class="settings-menu-item"
          >
            <span class="settings-menu-item__index">{{ String(index + 2).padStart(2, '0') }}</span>
            <strong>{{ item.label }}</strong>
            <span class="settings-menu-item__actions">
              <BaseIconButton
                size="sm"
                label="上移"
                :disabled="index === 0"
                @click="controller.moveMenuItem(item.page, 'up')"
              >↑</BaseIconButton>
              <BaseIconButton
                size="sm"
                label="下移"
                :disabled="index === menuItems.length - 1"
                @click="controller.moveMenuItem(item.page, 'down')"
              >↓</BaseIconButton>
            </span>
          </div>
          <div class="settings-menu-item is-fixed">
            <span class="settings-menu-item__index">{{ String(menuItems.length + 2).padStart(2, '0') }}</span>
            <strong>系统设置</strong><BaseBadge>固定</BaseBadge>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
