<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const emit = defineEmits<{
  'update:ratio': [value: number]
}>()

const dragging = ref(false)
const root = ref<HTMLElement | null>(null)

function clamp(r: number) {
  return Math.max(0.2, Math.min(0.8, r))
}

function onMove(event: MouseEvent) {
  if (!dragging.value || !root.value) return
  const workspace = root.value.parentElement
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  if (rect.width <= 0) return
  emit('update:ratio', clamp((event.clientX - rect.left) / rect.width))
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
}

function onDown(event: MouseEvent) {
  event.preventDefault()
  dragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onDblClick() {
  emit('update:ratio', 0.5)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <div
    ref="root"
    class="ft-splitter"
    :class="{ 'is-dragging': dragging }"
    title="拖拽调整左右栏宽度（双击复位）"
    role="separator"
    aria-orientation="vertical"
    @mousedown="onDown"
    @dblclick="onDblClick"
  />
</template>
