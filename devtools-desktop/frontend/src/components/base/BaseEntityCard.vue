<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'

import BaseButton from './BaseButton.vue'
import BaseCard from './BaseCard.vue'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  variant?: 'default' | 'raised' | 'subtle'
  density?: 'default' | 'compact'
  interactive?: boolean
  detailsLabel?: string
  detailsAriaLabel?: string
  ariaLabel?: string
  /**
   * 状态文案的位置。`block` 是独立面板，适合需要强调的运行态；
   * `footer` 把状态降级为底部说明文字，避免低信息量文案在卡片里形成框中框。
   */
  statusPlacement?: 'block' | 'footer'
  /**
   * 主体内容的对齐方式。`center` 适合单行主信息；
   * `stretch` 适合多行纵向内容（如验证码加进度线），让内容自行铺满宽度。
   */
  bodyAlign?: 'center' | 'stretch'
}>(), {
  modelValue: false,
  variant: 'default',
  density: 'default',
  interactive: false,
  detailsLabel: '查看详情',
  detailsAriaLabel: undefined,
  ariaLabel: undefined,
  statusPlacement: 'block',
  bodyAlign: 'center',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const slots = useSlots()
const hasDetails = computed(() => Boolean(slots.details))
const hasActions = computed(() => Boolean(slots.actions))
const hasStatus = computed(() => Boolean(slots.status))
const statusInBlock = computed(() => hasStatus.value && props.statusPlacement === 'block')
const statusInFooter = computed(() => hasStatus.value && props.statusPlacement === 'footer')
const hasFooter = computed(() => hasDetails.value || hasActions.value || statusInFooter.value)
const detailsId = `base-entity-card-details-${useId()}`
</script>

<template>
  <BaseCard
    class="base-entity-card"
    :class="[
      `base-entity-card--${density}`,
      { 'base-entity-card--expanded': modelValue },
    ]"
    :variant="variant"
    :interactive="interactive"
    content-padding="0"
    content-layout="column"
    :aria-label="ariaLabel"
  >
    <div class="base-entity-card__header">
      <div v-if="$slots.icon" class="base-entity-card__icon" aria-hidden="true">
        <slot name="icon" />
      </div>
      <div class="base-entity-card__identity">
        <div class="base-entity-card__title-line">
          <div class="base-entity-card__title"><slot name="title" /></div>
          <div v-if="$slots.badge" class="base-entity-card__badge"><slot name="badge" /></div>
        </div>
        <div v-if="$slots.subtitle" class="base-entity-card__subtitle"><slot name="subtitle" /></div>
      </div>
      <div v-if="$slots.headerExtra" class="base-entity-card__header-extra"><slot name="headerExtra" /></div>
    </div>

    <div v-if="$slots.meta" class="base-entity-card__meta"><slot name="meta" /></div>
    <div
      class="base-entity-card__body"
      :class="`base-entity-card__body--${bodyAlign}`"
    ><slot /></div>
    <div v-if="statusInBlock" class="base-entity-card__status"><slot name="status" /></div>

    <div v-if="hasFooter" class="base-entity-card__footer">
      <div v-if="statusInFooter" class="base-entity-card__footer-status"><slot name="status" /></div>
      <div class="base-entity-card__footer-controls">
        <BaseButton
          v-if="hasDetails"
          class="base-entity-card__details-trigger"
          variant="ghost"
          size="sm"
          :aria-label="detailsAriaLabel"
          :aria-expanded="modelValue"
          :aria-controls="detailsId"
          @click="emit('update:modelValue', !modelValue)"
        >
          {{ detailsLabel }}
          <!--
            用 SVG 而不是 › 字符：文字字形自带基线偏移让图标偏下，
            旋转后视觉盒还会变化，导致折叠与展开两个状态位置对不齐。
          -->
          <svg
            class="base-entity-card__details-arrow"
            :class="{ 'is-expanded': modelValue }"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 3.5 10.5 8 6 12.5"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </BaseButton>
        <div v-if="hasActions" class="base-entity-card__actions"><slot name="actions" /></div>
      </div>
    </div>

    <div
      v-if="hasDetails"
      v-show="modelValue"
      :id="detailsId"
      class="base-entity-card__details"
    ><slot name="details" /></div>
  </BaseCard>
</template>

<style scoped>
.base-entity-card {
  min-width: 0;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-normal) var(--ease-standard),
    transform var(--duration-normal) var(--ease-standard);
}

.base-entity-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.base-entity-card--expanded {
  border-color: color-mix(in srgb, var(--color-action) 58%, var(--color-border));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-action) 9%, transparent);
}

.base-entity-card__header {
  display: grid;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
  grid-template-columns: auto minmax(0, 1fr);
  padding: var(--space-4) var(--space-4) 0;
}

/* 头部尾随内容（标签等）不参与标题的省略号计算，单独占一列 */
.base-entity-card__header:has(.base-entity-card__header-extra) {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.base-entity-card__header-extra {
  min-width: 0;
  flex: 0 0 auto;
}

.base-entity-card__icon {
  display: grid;
  place-items: center;
}

.base-entity-card__identity,
.base-entity-card__title-line,
.base-entity-card__title {
  min-width: 0;
}

.base-entity-card__title-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.base-entity-card__title {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-entity-card__badge {
  flex: 0 0 auto;
}

.base-entity-card__subtitle {
  overflow: hidden;
  margin-top: var(--space-1);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-entity-card__meta {
  min-width: 0;
  padding: var(--space-3) var(--space-4) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.base-entity-card__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  padding: var(--space-4);
}

.base-entity-card__body--center {
  align-items: center;
}

/* 多行纵向主体：内容自行铺满宽度，底部间距交给下方区块 */
.base-entity-card__body--stretch {
  align-items: stretch;
  padding-bottom: 0;
}

.base-entity-card__status {
  min-width: 0;
  margin: 0 var(--space-4) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.base-entity-card__footer {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: auto var(--space-4) 0;
  border-top: 1px solid var(--color-border);
}

/* 底部状态是说明性文字，让出主动权给右侧操作，过长时省略而不是挤压按钮 */
.base-entity-card__footer-status {
  overflow: hidden;
  min-width: 0;
  flex: 1 1 auto;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-entity-card__footer-controls {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  margin-left: auto;
}

.base-entity-card__details-trigger {
  min-width: 0;
}

/* 没有底部状态时详情触发器是最左元素，负边距让文字与卡片内容左对齐 */
.base-entity-card__footer:not(:has(.base-entity-card__footer-status)) .base-entity-card__footer-controls {
  flex: 1 1 auto;
  justify-content: space-between;
}

.base-entity-card__footer:not(:has(.base-entity-card__footer-status)) .base-entity-card__details-trigger {
  margin-left: calc(var(--space-2) * -1);
}

/* 固定盒子：文字字形会带基线偏移，改用定尺 SVG 让展开前后位置一致 */
.base-entity-card__details-arrow {
  display: block;
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  margin-left: var(--space-1);
  color: var(--color-text-subtle);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.base-entity-card__details-arrow.is-expanded {
  transform: rotate(90deg);
}

.base-entity-card__details {
  margin: 0 var(--space-4);
  padding: 0 0 var(--space-4);
  border-top: 1px solid var(--color-border);
}

.base-entity-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

/*
  compact 只压缩纵向节奏，左右保持和 default 一致的 16px：
  同一网格里横向内边距不齐会让卡片显得没有对齐基线。
*/
.base-entity-card--compact .base-entity-card__header {
  padding: var(--space-3) var(--space-4) 0;
}

.base-entity-card--compact .base-entity-card__meta {
  padding: var(--space-2) var(--space-4) 0;
}

.base-entity-card--compact .base-entity-card__body {
  padding: var(--space-3) var(--space-4);
}

.base-entity-card--compact .base-entity-card__body--stretch {
  padding-bottom: 0;
}

.base-entity-card--compact .base-entity-card__status {
  margin-inline: var(--space-4);
}

.base-entity-card--compact .base-entity-card__footer,
.base-entity-card--compact .base-entity-card__details {
  margin-inline: var(--space-4);
}
</style>
