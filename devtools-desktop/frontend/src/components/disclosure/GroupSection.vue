<script setup lang="ts">
/**
 * redesign-v2 可折叠分组：分组标题 + 数量 + 重命名入口（运行页 / 部署页项目分组共用）。
 * 折叠行为复用 BaseDisclosure；重命名弹窗由调用方持有（本组件只发 rename 事件）。
 */
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDisclosure from './BaseDisclosure.vue'

withDefaults(defineProps<{
  modelValue: boolean
  title: string
  count?: number
  renamable?: boolean
}>(), {
  count: undefined,
  renamable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  rename: []
}>()
</script>

<template>
  <BaseDisclosure
    class="group-section"
    :model-value="modelValue"
    variant="plain"
    header-padding="var(--space-3) 0 var(--space-1)"
    content-padding="0 0 var(--space-3)"
    content-gap="var(--space-2)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <span class="group-section__title">{{ title }}</span>
      <span v-if="count !== undefined" class="group-section__count">{{ count }} 个</span>
    </template>
    <template v-if="renamable || $slots.actions" #actions>
      <slot name="actions" />
      <BaseIconButton
        v-if="renamable"
        label="重命名分组"
        size="sm"
        @click="emit('rename')"
      >✏️</BaseIconButton>
    </template>
    <slot />
  </BaseDisclosure>
</template>

<style scoped>
.group-section__title {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.group-section__count {
  margin-left: var(--space-2);
  color: var(--color-text-subtle);
  font-size: 11.5px;
  font-weight: var(--font-weight-regular);
}
</style>
