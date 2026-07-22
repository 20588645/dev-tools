<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { normalizeThemeMode, useAppStore, type Theme } from '@/stores/app'
import HomeView from '@/views/home/HomeView.vue'

defineOptions({ name: 'MigrationHost' })

const app = useAppStore()
let themeObserver: MutationObserver | null = null

function syncLegacyTheme() {
  const theme: Theme = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const mode = normalizeThemeMode(document.body.getAttribute('data-theme-mode'))
  if (app.theme !== theme || app.themeMode !== mode) app.syncTheme(mode, theme)
}

onMounted(() => {
  syncLegacyTheme()
  themeObserver = new MutationObserver(syncLegacyTheme)
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-mode'],
  })
})

onBeforeUnmount(() => themeObserver?.disconnect())
</script>

<template>
  <div class="migration-host" data-migration-host>
    <HomeView />
  </div>
</template>

<style scoped>
.migration-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
