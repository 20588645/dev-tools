<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  /** 标题下方的次要说明，如任务归属、记录条数。 */
  subtitle?: string
  width?: string
  closable?: boolean
  /**
   * 内容区最大高度（如 `min(760px, 82vh)`）。设置后内容区自身滚动，
   * 头部与底部保持吸附——用于日志这类内容长度不可预期的对话框。
   */
  bodyMaxHeight?: string
  /** 覆盖右上角关闭按钮的无障碍名与提示，如任务进行中时的「最小化」。 */
  closeLabel?: string
  /**
   * 内嵌日期/下拉选择器时设为 true。Naive 的浮层挂在 body 下的
   * .v-binder-follower-container（内联 z-index 2000，无法用 CSS 覆盖），
   * 默认对话框层级 20000 会把它压住导致无法点选，此时需让对话框退到浮层之下。
   */
  belowOverlays?: boolean
}>(), {
  subtitle: '',
  width: 'var(--component-dialog-width)',
  closable: true,
  bodyMaxHeight: undefined,
  closeLabel: undefined,
  belowOverlays: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = ref(props.modelValue)
watch(() => props.modelValue, (value) => { visible.value = value })
watch(visible, (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value)
})
const close = () => {
  if (!props.closable) return
  visible.value = false
}
</script>

<template>
  <NModal
    v-model:show="visible"
    preset="card"
    :closable="false"
    :style="{ width }"
    :mask-closable="closable"
    :z-index="belowOverlays ? 1900 : 20000"
    transform-origin="center"
    :on-close="close"
    :on-mask-click="close"
  >
    <template #header>
      <div class="base-dialog__header">
        <div class="base-dialog__heading">
          <span class="base-dialog__title">{{ title }}</span>
          <span v-if="subtitle" class="base-dialog__subtitle">{{ subtitle }}</span>
        </div>
        <NButton
          v-if="closable"
          quaternary
          circle
          size="small"
          :aria-label="closeLabel ?? '关闭'"
          :title="closeLabel ?? '关闭'"
          :on-click="close"
        >×</NButton>
      </div>
    </template>
    <div v-if="bodyMaxHeight" class="base-dialog__body" :style="{ maxHeight: bodyMaxHeight }">
      <slot />
    </div>
    <slot v-else />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </NModal>
</template>

<style scoped>
.base-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; }
.base-dialog__heading { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.base-dialog__title { color: var(--color-text); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }

.base-dialog__subtitle {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 内容区自身滚动，头部与底部由 NModal 的 card preset 保持吸附 */
.base-dialog__body { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
</style>
