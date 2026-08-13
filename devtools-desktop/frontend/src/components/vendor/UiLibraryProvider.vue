<script setup lang="ts">
import {
  darkTheme,
  dateZhCN,
  lightTheme,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  zhCN,
} from 'naive-ui'
import { computed, onBeforeUnmount } from 'vue'

import { createNaiveThemeOverrides } from '@/adapters/naive-ui'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const theme = computed(() => (app.theme === 'dark' ? darkTheme : lightTheme))
const themeOverrides = computed(() => {
  // 依赖 accentColor：运行时换肤后重读 vendor token，Naive 全局主题跟随
  void app.accentColor
  return createNaiveThemeOverrides(app.theme)
})
const overlayTarget = typeof document !== 'undefined' && document.querySelector('#ui-foundation-preview')
  ? '#ui-foundation-preview'
  : undefined

if (typeof document !== 'undefined') {
  app.startThemeSync()
}
onBeforeUnmount(() => {
  app.stopThemeSync()
})
</script>

<template>
  <NConfigProvider class="ui-library-provider" :locale="zhCN" :date-locale="dateZhCN" :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider
      :to="overlayTarget"
      placement="top-right"
      closable
      keep-alive-on-hover
      container-class="app-toast-container"
    >
      <NDialogProvider :to="overlayTarget">
        <NNotificationProvider :to="overlayTarget">
          <slot />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.ui-library-provider {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
