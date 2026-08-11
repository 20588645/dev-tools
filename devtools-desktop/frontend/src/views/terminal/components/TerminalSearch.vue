<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'

const props = defineProps<{
  open: boolean
  query: string
  countLabel: string
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  search: [direction: 'next' | 'prev', incremental?: boolean]
  close: []
}>()

const inputRef = ref<{ focus: () => void } | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  await nextTick()
  inputRef.value?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    emit('search', e.shiftKey ? 'prev' : 'next')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

function onQuery(value: string) {
  emit('update:query', value)
  emit('search', 'next', true)
}
</script>

<template>
  <div class="term-search-bar" :class="{ active: open }" role="search">
    <BaseInput
      ref="inputRef"
      :model-value="query"
      size="sm"
      variant="plain"
      placeholder="查找日志..."
      aria-label="终端搜索"
      autocomplete="off"
      class="term-search-bar__input"
      @update:model-value="onQuery"
      @keydown="onKeydown"
    />
    <span class="term-search-bar__count">{{ countLabel }}</span>
    <BaseIconButton label="上一个" size="sm" @click="emit('search', 'prev')">
      <span aria-hidden="true">▲</span>
    </BaseIconButton>
    <BaseIconButton label="下一个" size="sm" @click="emit('search', 'next')">
      <span aria-hidden="true">▼</span>
    </BaseIconButton>
    <BaseIconButton label="关闭搜索" size="sm" @click="emit('close')">
      <span aria-hidden="true">✕</span>
    </BaseIconButton>
  </div>
</template>
