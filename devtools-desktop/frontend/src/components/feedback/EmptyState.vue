<script setup lang="ts">
import { computed } from 'vue'
import { NEmpty } from 'naive-ui'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  compact?: boolean
}>(), { title: '暂无内容', description: undefined, compact: false })

const emptyDescription = computed(() => props.description ? `${props.title} · ${props.description}` : props.title)
</script>

<template>
  <NEmpty class="empty-state" :class="{ 'empty-state--compact': compact }" :size="compact ? 'small' : 'medium'" :description="emptyDescription">
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.actions" #extra><slot name="actions" /></template>
  </NEmpty>
</template>

<style scoped>
.empty-state { min-height: 160px; padding: var(--space-8); }
.empty-state--compact { min-height: 58px; padding: var(--space-2) 0; }
</style>
