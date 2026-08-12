<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import { UiLibraryProvider } from './plugins/ui-library'
import AppToastHost from './components/feedback/AppToastHost.vue'
import AppShell from './components/shell/AppShell.vue'

const UiFoundationPreview = defineAsyncComponent(() => import('./views/UiFoundationPreview.vue'))

const search = new URLSearchParams(window.location.search)
const showUiFoundationPreview = import.meta.env.DEV && search.get('uiFoundation') === '1'
</script>

<template>
  <div v-if="showUiFoundationPreview" id="ui-foundation-preview" class="ui-foundation-preview">
    <UiLibraryProvider>
      <UiFoundationPreview />
      <AppToastHost />
    </UiLibraryProvider>
  </div>
  <UiLibraryProvider v-else>
    <AppShell />
    <AppToastHost />
  </UiLibraryProvider>
</template>

<style>
.ui-foundation-preview {
  position: fixed;
  z-index: var(--z-preview);
  inset: 0;
  overflow: auto;
  background: var(--color-page);
}

#app {
  height: 100%;
  min-height: 100vh;
}
</style>
