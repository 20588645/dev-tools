<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'

const props = withDefaults(defineProps<{
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}>(), { tone: 'neutral' })

const type = computed<'default' | 'info' | 'success' | 'warning' | 'error'>(() => props.tone === 'danger' ? 'error' : props.tone === 'neutral' ? 'default' : props.tone)
</script>

<template>
  <NTag class="base-badge" :type="type" :bordered="false" size="small">
    <slot />
  </NTag>
</template>

<style scoped>
.base-badge { font-weight: var(--font-weight-medium); }
</style>
