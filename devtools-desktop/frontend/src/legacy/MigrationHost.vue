<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'

import { onLegacyPageActivation, type LegacyPageId } from '@/legacy/legacy-bridge'
import { normalizeThemeMode, useAppStore, type Theme } from '@/stores/app'
import HomeView from '@/views/home/HomeView.vue'

defineOptions({ name: 'MigrationHost' })

const IpCheckView = defineAsyncComponent(() => import('@/views/ipcheck/IpCheckView.vue'))
const app = useAppStore()
const activePage = ref<LegacyPageId>(
  (document.querySelector('.page.active')?.id.replace(/^page-/, '') as LegacyPageId | undefined) ?? 'home',
)
const hasIpCheckTarget = Boolean(document.querySelector('#vue-ipcheck-host'))
let themeObserver: MutationObserver | null = null
let stopPageActivation: (() => void) | null = null

function syncLegacyTheme() {
  const theme: Theme = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const mode = normalizeThemeMode(document.body.getAttribute('data-theme-mode'))
  if (app.theme !== theme || app.themeMode !== mode) app.syncTheme(mode, theme)
}

onMounted(() => {
  syncLegacyTheme()
  stopPageActivation = onLegacyPageActivation(({ pageId }) => {
    activePage.value = pageId
  })
  themeObserver = new MutationObserver(syncLegacyTheme)
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-mode'],
  })
})

onBeforeUnmount(() => {
  stopPageActivation?.()
  themeObserver?.disconnect()
})
</script>

<template>
  <div class="migration-host" data-migration-host>
    <HomeView />
    <Teleport v-if="hasIpCheckTarget" to="#vue-ipcheck-host">
      <KeepAlive>
        <IpCheckView v-if="activePage === 'ipcheck'" />
      </KeepAlive>
    </Teleport>
  </div>
</template>

<style scoped>
.migration-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
