<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'

/**
 * 服务器行的三个操作。单独成组件而非在表格 render 里手搓 SVG：
 * 描边图标与本页项目卡保持同一套（D5——旧实现用 emoji，跨系统渲染不一致）。
 */
defineOptions({ name: 'ServerRowActions' })

defineProps<{ name: string }>()

const emit = defineEmits<{ edit: [], test: [], remove: [] }>()
</script>

<template>
  <div class="deploy-servers__actions">
    <BaseIconButton :label="`编辑 ${name}`" size="sm" @click="emit('edit')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </BaseIconButton>
    <BaseIconButton :label="`测试连接 ${name}`" size="sm" @click="emit('test')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2 3 14h9l-1 8 10-12h-9Z" />
      </svg>
    </BaseIconButton>
    <BaseIconButton :label="`删除 ${name}`" size="sm" variant="danger" @click="emit('remove')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </BaseIconButton>
  </div>
</template>

<style scoped>
.deploy-servers__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
}
</style>
