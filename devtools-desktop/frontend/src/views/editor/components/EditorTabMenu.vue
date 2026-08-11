<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

export interface EdCtxItem {
  label: string
  disabled?: boolean
  separator?: boolean
  action?: () => void
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: EdCtxItem[]
}>()

const emit = defineEmits<{ close: [] }>()

function placeStyle() {
  const w = 168
  const h = props.items.reduce((n, it) => n + (it.separator ? 11 : 34), 8)
  return {
    left: `${Math.min(props.x, window.innerWidth - w - 8)}px`,
    top: `${Math.min(props.y, window.innerHeight - h - 8)}px`,
  }
}

function onPick(item: EdCtxItem) {
  if (item.disabled || item.separator || !item.action) return
  emit('close')
  item.action()
}

function onDismiss(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.ed-tab-menu')) return
  emit('close')
}

function onEsc(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

function bind() {
  document.addEventListener('mousedown', onDismiss, true)
  document.addEventListener('keydown', onEsc, true)
}

function unbind() {
  document.removeEventListener('mousedown', onDismiss, true)
  document.removeEventListener('keydown', onEsc, true)
}

watch(() => props.open, (open) => {
  unbind()
  if (open) bind()
})

onMounted(() => { if (props.open) bind() })
onBeforeUnmount(unbind)
</script>

<template>
  <div
    v-if="open && items.length"
    class="ed-tab-menu"
    :style="placeStyle()"
    role="menu"
  >
    <template v-for="(item, idx) in items" :key="idx">
      <div v-if="item.separator" class="ed-tab-menu-sep" />
      <div
        v-else
        class="ed-tab-menu-item"
        :class="{ disabled: item.disabled }"
        role="menuitem"
        @click="onPick(item)"
      >
        {{ item.label }}
      </div>
    </template>
  </div>
</template>
