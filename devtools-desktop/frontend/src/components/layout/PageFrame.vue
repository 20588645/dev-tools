<script setup lang="ts">
import PageBody from './PageBody.vue'

withDefaults(defineProps<{
  variant?: 'standard' | 'immersive' | 'workspace'
}>(), { variant: 'standard' })
</script>

<template>
  <div class="page-frame" :data-variant="variant">
    <slot name="top" />
    <PageBody class="page-frame__body">
      <slot />
    </PageBody>
  </div>
</template>

<style scoped>
/* redesign-v2：页面骨架透明，让 body 的渐变画布透出（卡片自身承担表面色） */
.page-frame {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--color-text);
  background: transparent;
}

.page-frame[data-variant="immersive"] .page-frame__body {
  padding: 0;
}

.page-frame[data-variant="workspace"] .page-frame__body {
  padding: var(--space-4);
}
</style>
