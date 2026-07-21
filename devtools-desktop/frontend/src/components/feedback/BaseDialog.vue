<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  closable?: boolean
}>(), {
  width: 'var(--component-dialog-width)',
  closable: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const close = () => {
  if (props.closable) emit('update:modelValue', false)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-layer" role="presentation" @mousedown.self="close">
      <section class="base-dialog" role="dialog" aria-modal="true" :aria-label="title" :style="{ width }">
        <header class="base-dialog__header">
          <h2>{{ title }}</h2>
          <button v-if="closable" class="base-dialog__close" type="button" aria-label="关闭" @click="close">×</button>
        </header>
        <div class="base-dialog__body"><slot /></div>
        <footer v-if="$slots.footer" class="base-dialog__footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-layer { position: fixed; z-index: var(--z-dialog); inset: 0; display: grid; place-items: center; padding: var(--space-6); background: var(--color-overlay); }
.base-dialog { max-width: min(100%, var(--component-dialog-width)); max-height: min(680px, 100%); overflow: auto; color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
.base-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--color-border); }
h2 { margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
.base-dialog__close { width: 28px; height: 28px; color: var(--color-text-muted); background: transparent; border: 0; border-radius: var(--radius-sm); cursor: pointer; font-size: var(--font-size-xl); line-height: 1; }
.base-dialog__close:hover { color: var(--color-text); background: var(--color-surface-subtle); }
.base-dialog__close:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.base-dialog__body { padding: var(--space-4); }
.base-dialog__footer { display: flex; justify-content: flex-end; gap: var(--space-2); padding: 0 var(--space-4) var(--space-4); }
</style>
