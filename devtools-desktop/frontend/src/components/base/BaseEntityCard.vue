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
   * `footer` 把状态降级为底部说明文字，避免低信息量文案在卡片里形成框中框；
   * `body` 贴在主体末尾，配合 statusTone 与 statusDetail 形成固定两行的状态区。
   */
  statusPlacement?: 'block' | 'footer' | 'body'
  /**
   * 状态语义色。只作用于状态点和主行文字，不做区域底色，
   * 避免用大面积上色表达一个状态。
   */
  statusTone?: 'neutral' | 'active' | 'warning' | 'danger'
  /**
   * 主体内容的对齐方式。`center` 适合单行主信息；
   * `stretch` 适合多行纵向内容（如验证码加进度线），让内容自行铺满宽度。
   */
  bodyAlign?: 'center' | 'stretch'
  /**
   * 表面质感。`sheen` 在卡片顶部叠一层极浅的白色渐变，
   * 表达受光而非装饰色，避免大面积纯色卡面显得死平。
   */
  surface?: 'flat' | 'sheen'
  /**
   * 撑满网格行高。配合 `align-items: stretch` 的卡片网格使用，
   * 让同排卡片等高；卡片自身内容行数固定时跨排高度也一致。
   */
  fillHeight?: boolean
  /**
   * 操作区排布。`compact` 按内容宽右对齐，适合次要操作；
   * `spread` 让按钮以 82px 为基准弹性分配底部宽度，主操作因此保有视觉权重，
   * 同时不会像满宽拉伸那样把普通按钮变成通栏色块。
   */
  actionsLayout?: 'compact' | 'spread'
}>(), {
  modelValue: false,
  variant: 'default',
  density: 'default',
  interactive: false,
  detailsLabel: '查看详情',
  detailsAriaLabel: undefined,
  ariaLabel: undefined,
  statusPlacement: 'block',
  statusTone: 'neutral',
  bodyAlign: 'center',
  surface: 'flat',
  fillHeight: false,
  actionsLayout: 'compact',
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
const statusInBody = computed(() => hasStatus.value && props.statusPlacement === 'body')
const hasFooter = computed(() => hasDetails.value || hasActions.value || statusInFooter.value)
const detailsId = `base-entity-card-details-${useId()}`
</script>

<template>
  <BaseCard
    class="base-entity-card"
    :class="[
      `base-entity-card--${density}`,
      `base-entity-card--${surface}`,
      {
        'base-entity-card--expanded': modelValue,
        'base-entity-card--fill-height': fillHeight,
      },
    ]"
    :variant="variant"
    :interactive="interactive"
    :fill-height="fillHeight"
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
    >
      <slot />
      <!--
        固定两行的状态区：主行 + 细节行。所有状态都占同样的行数，
        卡片高度因此与状态无关，异常态不会把同排卡片顶高。
      -->
      <div
        v-if="statusInBody"
        class="base-entity-card__state"
        :class="`base-entity-card__state--${statusTone}`"
      >
        <span class="base-entity-card__state-dot" aria-hidden="true" />
        <p class="base-entity-card__state-line"><slot name="status" /></p>
        <p class="base-entity-card__state-detail"><slot name="statusDetail" /></p>
      </div>
    </div>
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
        <div
          v-if="hasActions"
          class="base-entity-card__actions"
          :class="`base-entity-card__actions--${actionsLayout}`"
        ><slot name="actions" /></div>
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
  position: relative;
  min-width: 0;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-normal) var(--ease-standard),
    transform var(--duration-normal) var(--ease-standard);
}

.base-entity-card--fill-height {
  height: 100%;
}

/*
  表面受光：顶部一层极浅的白色渐变。这不是装饰色而是材质高光，
  暗色下降到 6% 白，两个主题都只影响明度、不引入色相。
  用背景图层而非伪元素：伪元素叠在定位根上会盖住文字。
*/
.base-entity-card--sheen {
  background-image: var(--component-entity-card-sheen);
  background-repeat: no-repeat;
  background-size: 100% 60px;
  /* 顶部 1px 内高光：受光边缘让卡片有厚度，不引入色相 */
  box-shadow: var(--shadow-sm), var(--component-entity-card-edge);
}

.base-entity-card--sheen:hover {
  box-shadow: var(--shadow-md), var(--component-entity-card-edge);
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
  min-width: 0;
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

/* 多行纵向主体：改纵向排列并铺满宽度，供多段内容依次堆叠 */
.base-entity-card__body--stretch {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
}

/*
  末尾紧贴下一区块的场景（如倒计时进度线）不留底部内边距；
  但主体内含两行状态区时需要保留，否则状态会贴到底部分隔线上。
*/
.base-entity-card__body--stretch:not(:has(.base-entity-card__state)) {
  padding-bottom: 0;
}

/*
  两行状态区：第一行是状态点 + 主行，第二行是细节。
  行数固定，所以卡片高度不随状态变化；语义色只落在点和主行文字上。
*/
.base-entity-card__state {
  display: grid;
  min-width: 0;
  align-content: center;
  min-height: 34px;
  margin-top: auto;
  gap: 0 7px;
  grid-template-columns: auto minmax(0, 1fr);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

.base-entity-card__state--active { color: var(--color-success); }
.base-entity-card__state--warning { color: var(--color-warning); }
.base-entity-card__state--danger { color: var(--color-danger); }

.base-entity-card__state-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  grid-row: 1;
  border-radius: var(--radius-pill);
  background: currentColor;
}

.base-entity-card__state--neutral .base-entity-card__state-dot {
  background: var(--color-border-strong);
}

.base-entity-card__state-line {
  overflow: hidden;
  margin: 0;
  grid-row: 1;
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-entity-card__state-detail {
  overflow: hidden;
  margin: 1px 0 0;
  grid-column: 2;
  grid-row: 2;
  color: var(--color-text-subtle);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* 操作区内如果放了说明文字，让它撑开剩余宽度把按钮推到右侧 */
.base-entity-card__footer:not(:has(.base-entity-card__footer-status)) .base-entity-card__actions {
  flex: 1 1 auto;
}

/*
  spread：按钮以 82px 为基准弹性分配宽度。
  给基准值而不是纯 flex: 1 是关键——纯拉伸会把普通按钮变成通栏色块，
  有基准值才既保住主操作的视觉权重、又不至于铺满整行。
*/
.base-entity-card__actions--spread {
  flex: 1 1 auto;
  justify-content: flex-start;
}

/*
  上限同样重要：宽卡片里没有 max-width 的话按钮会一路拉成通栏色块，
  又回到「一张卡上两条大色条」的问题。
*/
.base-entity-card__actions--spread > * {
  min-width: 74px;
  max-width: 148px;
  height: 32px;
  flex: 1 1 82px;
}

/* 图标按钮是定尺控件，不参与弹性分配 */
.base-entity-card__actions--spread > .base-icon-button {
  min-width: 0;
  flex: 0 0 auto;
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
