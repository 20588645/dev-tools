<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  /** 标题下方的次要说明，如任务归属、记录条数。 */
  subtitle?: string
  /**
   * 两档宽度，第三态只改高度策略：
   * - `standard`：工作弹窗 720，内容超出后滚动
   * - `compact`：确认 / 重命名 / 单行输入 400，高度跟着内容
   * - `log`：同样 720，但预留固定内容区（日志、更新进度），打开时不从小窗长出来
   * 页面不要再传 `width` / `body-max-height`。
   */
  size?: 'standard' | 'compact' | 'log'
  width?: string
  closable?: boolean
  /**
   * 内容区最大高度。标准弹窗默认用 `--component-dialog-body-max`，
   * 内容超出后自身滚动，头部与底部保持吸附。
   */
  bodyMaxHeight?: string
  /**
   * 内容区固定高度。日志/进度这类「先空后满」的弹窗必须用这个，
   * 避免打开时很小、内容涌入后再撑开造成闪烁。
   */
  bodyHeight?: string
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
  size: 'standard',
  width: undefined,
  closable: true,
  bodyMaxHeight: undefined,
  bodyHeight: undefined,
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

const dialogClass = computed(() => {
  if (props.size === 'compact') return 'base-dialog base-dialog--compact'
  if (props.size === 'log') return 'base-dialog base-dialog--standard base-dialog--log'
  return 'base-dialog base-dialog--standard'
})

const resolvedWidth = computed(() => {
  if (props.width) return props.width
  return props.size === 'compact'
    ? 'var(--component-dialog-width-sm)'
    : 'var(--component-dialog-width)'
})

const resolvedBodyHeight = computed(() => {
  if (props.bodyHeight) return props.bodyHeight
  if (props.size === 'log') return 'var(--component-dialog-body-log)'
  return undefined
})

const bodyStyle = computed(() => {
  if (resolvedBodyHeight.value) {
    return {
      height: resolvedBodyHeight.value,
      minHeight: resolvedBodyHeight.value,
      maxHeight: resolvedBodyHeight.value,
    }
  }
  const maxHeight = props.bodyMaxHeight ?? (
    props.size === 'compact' ? undefined : 'var(--component-dialog-body-max)'
  )
  if (!maxHeight) return undefined
  return { maxHeight }
})
</script>

<template>
  <NModal
    v-model:show="visible"
    :class="dialogClass"
    preset="card"
    :closable="false"
    :style="{ width: resolvedWidth }"
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
    <div
      v-if="bodyStyle"
      class="base-dialog__body"
      :class="{ 'base-dialog__body--fixed': Boolean(resolvedBodyHeight) }"
      :style="bodyStyle"
    >
      <div v-if="resolvedBodyHeight" class="base-dialog__body-fill">
        <slot />
      </div>
      <slot v-else />
    </div>
    <slot v-else />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </NModal>
</template>

<style scoped>
.base-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; }
.base-dialog__heading { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.base-dialog__title { color: var(--color-text); font-size: 16px; font-weight: var(--font-weight-bold); }

.base-dialog__subtitle {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: 12.5px;
  font-weight: var(--font-weight-regular);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

/* 内容区自身滚动，头部与底部由 NModal 的 card preset 保持吸附 */
.base-dialog__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

/* 固定高度：子级填满预留空间并在内部滚动，弹窗尺寸不随内容增长 */
.base-dialog__body--fixed {
  overflow: hidden;
}

.base-dialog__body-fill {
  display: grid;
  grid-template-rows: 1fr;
  min-height: 0;
  height: 100%;
}
</style>

<style>
/* redesign-v2 方案 B：毛玻璃弹窗（NModal 传送到 body 下，需组件自有的全局规则接管框体与遮罩） */
.n-modal.base-dialog {
  max-width: calc(100vw - var(--component-dialog-gutter));
  max-height: calc(100vh - var(--component-dialog-viewport-inset));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-glass-strong);
  backdrop-filter: var(--component-glass-blur-strong);
  -webkit-backdrop-filter: var(--component-glass-blur-strong);
  box-shadow: var(--shadow-lg);
}

.n-modal.base-dialog .n-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  max-height: calc(100vh - var(--component-dialog-viewport-inset));
  overflow: hidden;
}

.n-modal.base-dialog .n-card-header { padding: 18px 22px 0; }
.n-modal.base-dialog .n-card__content { min-height: 0; overflow: hidden; padding: 16px 22px; }
.n-modal.base-dialog--compact .n-card__content { overflow: auto; }
.n-modal.base-dialog .n-card__footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 22px 18px;
}

.n-modal-mask {
  background: var(--color-overlay);
  backdrop-filter: var(--component-overlay-blur);
  -webkit-backdrop-filter: var(--component-overlay-blur);
}
</style>
