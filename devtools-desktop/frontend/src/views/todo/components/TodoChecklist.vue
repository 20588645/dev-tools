<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'

import type { TodoChecklistItem } from '../todo-content'

defineProps<{ items: TodoChecklistItem[] }>()

const emit = defineEmits<{
  update: [index: number, patch: Partial<Pick<TodoChecklistItem, 'text' | 'done'>>]
  add: [index?: number]
  remove: [index: number]
}>()

function handleKeydown(event: KeyboardEvent, index: number) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  emit('add', index)
}
</script>

<template>
  <div class="todo-checklist">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="todo-checklist__item"
      :class="{ 'is-done': item.done }"
    >
      <BaseCheckbox
        :model-value="item.done"
        :label="item.done ? '已完成' : '未完成'"
        :label-visible="false"
        :aria-label="`切换子任务 ${index + 1}`"
        @update:model-value="emit('update', index, { done: $event })"
      />
      <BaseInput
        :model-value="item.text"
        variant="plain"
        :text-variant="item.done ? 'completed' : 'default'"
        :aria-label="`子任务 ${index + 1}`"
        placeholder="输入子任务内容"
        @update:model-value="emit('update', index, { text: $event })"
        @keydown="handleKeydown($event, index)"
      />
      <BaseIconButton
        label="删除子任务"
        size="sm"
        variant="ghost"
        @click="emit('remove', index)"
      >×</BaseIconButton>
    </div>
    <BaseButton class="todo-checklist__add" variant="ghost" size="sm" @click="emit('add')">
      ＋ 添加子任务
    </BaseButton>
  </div>
</template>
