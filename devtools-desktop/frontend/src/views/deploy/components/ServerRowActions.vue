<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

/**
 * 服务器行的三个操作。按原型 deploy-servers 用文字按钮
 * （测试连接 / 编辑 / 删除红字），不再用图标钮。
 */
defineOptions({ name: 'ServerRowActions' })

defineProps<{ name: string }>()

const emit = defineEmits<{ edit: [], test: [], remove: [] }>()
</script>

<template>
  <div class="deploy-servers__actions">
    <BaseButton size="sm" variant="secondary" :aria-label="`测试连接 ${name}`" @click="emit('test')">测试连接</BaseButton>
    <BaseButton size="sm" variant="secondary" :aria-label="`编辑 ${name}`" @click="emit('edit')">编辑</BaseButton>
    <BaseButton
      class="deploy-servers__remove"
      size="sm"
      variant="ghost"
      :aria-label="`删除 ${name}`"
      @click="emit('remove')"
    >删除</BaseButton>
  </div>
</template>

<style scoped>
.deploy-servers__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
}

/* 原型 .btn.danger：红字弱化删除 */
.deploy-servers__remove {
  color: var(--color-danger);
}
</style>
