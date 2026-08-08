<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'

/**
 * 历史行的两个操作。旧实现用 `⌗` / `⌫` 两个字符且只有 title 没有 aria-label
 * （H3），这里统一为描边 SVG + 无障碍名，与项目总览、服务器管理两个子页一致。
 */
defineOptions({ name: 'HistoryRowActions' })

defineProps<{ label: string }>()

const emit = defineEmits<{ view: [], remove: [] }>()
</script>

<template>
  <div class="deploy-history__actions">
    <BaseIconButton :label="`查看 ${label} 的日志`" size="sm" @click="emit('view')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" />
      </svg>
    </BaseIconButton>
    <BaseIconButton :label="`删除 ${label} 的记录`" size="sm" variant="danger" @click="emit('remove')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </BaseIconButton>
  </div>
</template>

<style scoped>
.deploy-history__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
}
</style>
