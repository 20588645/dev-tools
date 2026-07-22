<script setup lang="ts">
import { NSpin } from 'naive-ui'

withDefaults(defineProps<{
  label?: string
  compact?: boolean
}>(), { label: '正在加载…', compact: false })
</script>

<template>
  <NSpin class="loading-state" :class="{ 'loading-state--compact': compact }" :size="compact ? 'small' : 'medium'" :description="label" role="status" />
</template>

<style scoped>
.loading-state { min-height: 160px; }
.loading-state--compact { min-height: 40px; }
</style>
