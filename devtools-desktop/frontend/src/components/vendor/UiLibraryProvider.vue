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
import { computed } from 'vue'

import { createNaiveThemeOverrides } from '@/adapters/naive-ui'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const theme = computed(() => (app.theme === 'dark' ? darkTheme : lightTheme))
const themeOverrides = computed(() => createNaiveThemeOverrides(app.theme))

if (typeof document !== 'undefined') app.applyTheme(app.theme)
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <slot />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
