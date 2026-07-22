<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'

withDefaults(defineProps<{
  title?: string
  description?: string
}>(), { title: '加载失败', description: '请稍后重试。' })

defineEmits<{ retry: [] }>()
</script>

<template>
  <NResult class="error-state" role="alert" status="error" :title="title" :description="description">
    <template #footer><NButton secondary @click="$emit('retry')">重新加载</NButton></template>
  </NResult>
</template>

<style scoped>
.error-state { min-height: 160px; padding: var(--space-8); }
</style>
