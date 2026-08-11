<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'

export interface FtCtxItem {
  label: string
  danger?: boolean
  action: () => void
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: FtCtxItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

function placeStyle() {
  const w = 160
  const h = props.items.length * 34 + 8
  return {
    left: `${Math.min(props.x, window.innerWidth - w - 8)}px`,
    top: `${Math.min(props.y, window.innerHeight - h - 8)}px`,
  }
}

function onPick(item: FtCtxItem) {
  emit('close')
  item.action()
}

function onDismiss(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.ft-ctx-menu')) return
  emit('close')
}

function onEsc(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

function onBlur() {
  emit('close')
}

function bind() {
  document.addEventListener('mousedown', onDismiss, true)
  document.addEventListener('keydown', onEsc, true)
  window.addEventListener('blur', onBlur)
}

function unbind() {
  document.removeEventListener('mousedown', onDismiss, true)
  document.removeEventListener('keydown', onEsc, true)
  window.removeEventListener('blur', onBlur)
}

watch(() => props.open, (open) => {
  unbind()
  if (open) bind()
})

onMounted(() => {
  if (props.open) bind()
})

onBeforeUnmount(unbind)
</script>

<template>
  <div
    v-if="open && items.length"
    class="ft-ctx-menu"
    :style="placeStyle()"
    role="menu"
  >
    <BaseButton
      v-for="(item, i) in items"
      :key="`${item.label}-${i}`"
      size="sm"
      :variant="item.danger ? 'danger' : 'ghost'"
      @click="onPick(item)"
    >
      {{ item.label }}
    </BaseButton>
  </div>
</template>
