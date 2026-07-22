<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'

withDefaults(defineProps<{
  title?: string
  description?: string
  compact?: boolean
}>(), { title: '加载失败', description: '请稍后重试。', compact: false })

defineEmits<{ retry: [] }>()
</script>

<template>
  <NResult
    class="error-state"
    :class="{ 'error-state--compact': compact }"
    role="alert"
    status="error"
    :show-icon="!compact"
    :title="title"
    :description="description"
  >
    <template #footer><NButton secondary :size="compact ? 'small' : 'medium'" @click="$emit('retry')">重新加载</NButton></template>
  </NResult>
</template>

<style scoped>
.error-state { min-height: 160px; padding: var(--space-8); }
.error-state--compact { min-height: 58px; padding: var(--space-1) 0; }
</style>
