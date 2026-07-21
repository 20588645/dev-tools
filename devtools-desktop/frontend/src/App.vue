<script setup lang="ts">
import MigrationHost from './legacy/MigrationHost.vue'
import UiFoundationPreview from './views/UiFoundationPreview.vue'

const showUiFoundationPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('uiFoundation') === '1'
</script>

<template>
  <div v-if="showUiFoundationPreview" class="ui-foundation-preview">
    <UiFoundationPreview />
  </div>
  <MigrationHost v-else />
</template>

<style>
.ui-foundation-preview {
  position: fixed;
  z-index: var(--z-preview);
  inset: 0;
  overflow: auto;
  background: var(--color-page);
}
</style>
