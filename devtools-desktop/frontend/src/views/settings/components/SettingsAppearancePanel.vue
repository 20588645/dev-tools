<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'
import BaseSwitch from '@/components/form/BaseSwitch.vue'
import BaseSegmented from '@/components/navigation/BaseSegmented.vue'

import type { SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const {
  app,
  notificationEnabled,
  notificationLabel,
  experimentalExpanded,
  live2dEnabled,
  clickEffectEnabled,
  operation,
} = props.controller
const themeOptions = [
  { label: '系统', value: 'system' },
  { label: '亮色', value: 'light' },
  { label: '暗色', value: 'dark' },
]
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsAppearanceTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsAppearanceTitle">外观与通知</h2><p>主题、系统通知与非核心实验功能</p></div>
      <span>SYSTEM AWARE</span>
    </div>

    <div class="settings-panel-grid">
      <article class="settings-card" data-setting-id="theme" tabindex="-1">
        <header class="settings-card__heading">
          <h3>界面主题</h3>
          <BaseBadge>{{ app.themeMode === 'system' ? '跟随系统' : app.theme === 'light' ? '亮色' : '暗色' }}</BaseBadge>
        </header>
        <div class="settings-card__body">
          <div class="settings-row">
            <span class="settings-row__copy"><strong>主题模式</strong><small>系统变化时自动同步</small></span>
            <BaseSegmented
              :model-value="app.themeMode"
              :options="themeOptions"
              aria-label="主题模式"
              @update:model-value="controller.setThemeMode"
            />
          </div>
          <div class="settings-row">
            <span class="settings-row__copy">
              <strong>当前生效</strong>
              <small>{{ app.themeMode === 'system' ? '跟随系统外观' : '已手动锁定' }}</small>
            </span>
            <code>{{ app.theme === 'light' ? '亮色' : '暗色' }}</code>
          </div>
        </div>
      </article>

      <article class="settings-card" data-setting-id="notification" tabindex="-1">
        <header class="settings-card__heading">
          <h3>系统通知</h3>
          <BaseBadge :tone="notificationLabel === '已授权' ? 'success' : notificationEnabled ? 'warning' : 'neutral'">
            {{ notificationLabel }}
          </BaseBadge>
        </header>
        <div class="settings-card__body">
          <div class="settings-row">
            <BaseSwitch
              class="settings-switch-row"
              :model-value="notificationEnabled"
              label="任务通知"
              description="构建与部署完成后提醒"
              @update:model-value="controller.toggleNotification"
            />
          </div>
          <div class="settings-row">
            <span class="settings-row__copy"><strong>权限状态</strong><small>{{ notificationLabel }}</small></span>
            <BaseButton
              size="sm"
              variant="secondary"
              :loading="operation.notification === 'working'"
              @click="controller.testNotification"
            >发送测试</BaseButton>
          </div>
        </div>
      </article>
    </div>

    <BaseDisclosure
      v-model="experimentalExpanded"
      class="settings-card settings-experimental"
      variant="plain"
      arrow-placement="right"
      header-padding="0 var(--space-3)"
      header-min-height="42px"
      content-padding="0"
      data-setting-id="experimental"
      tabindex="-1"
    >
      <template #header>
        <span class="settings-experimental__summary"><strong>实验功能</strong><small>默认关闭 · 非核心体验</small></span>
      </template>
      <template v-if="experimentalExpanded">
        <div class="settings-row">
          <BaseSwitch
            class="settings-switch-row"
            :model-value="live2dEnabled"
            label="Live2D 看板娘"
            description="需要联网加载外部资源"
            @update:model-value="controller.updateExperiment('live2d', $event)"
          />
        </div>
        <div class="settings-row">
          <BaseSwitch
            class="settings-switch-row"
            :model-value="clickEffectEnabled"
            label="点击粒子"
            description="在指针位置显示短暂动画"
            @update:model-value="controller.updateExperiment('click-effect', $event)"
          />
        </div>
      </template>
    </BaseDisclosure>
  </section>
</template>
