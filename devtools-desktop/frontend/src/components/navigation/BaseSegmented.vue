<script setup lang="ts">
import { computed } from 'vue'
import { NTabPane, NTabs } from 'naive-ui'

export interface SegmentOption {
  label: string
  value: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: SegmentOption[]
  ariaLabel?: string
}>(), { ariaLabel: '分段选择' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const activeValue = computed(() => props.modelValue)
const segmentedThemeOverrides = {
  tabTextColorSegment: 'var(--color-text-muted)',
  tabTextColorActiveSegment: 'var(--color-text)',
  tabTextColorHoverSegment: 'var(--color-text)',
  tabColorSegment: 'var(--color-surface)',
  tabPaddingSmallSegment: '0 var(--space-3)',
  tabPaddingMediumSegment: '0 var(--space-3)',
  tabPaddingLargeSegment: '0 var(--space-3)',
  tabPaddingVerticalSmallSegment: '0 var(--space-3)',
  tabPaddingVerticalLargeSegment: '0 var(--space-3)',
  tabFontSizeSmall: 'var(--component-button-font-size)',
  tabFontSizeMedium: 'var(--component-button-font-size)',
  tabFontWeight: 'var(--font-weight-medium)',
  tabFontWeightActive: 'var(--font-weight-semibold)',
  tabBorderRadius: 'var(--component-control-radius)',
}
</script>

<template>
  <NTabs
    class="base-segmented"
    :value="activeValue"
    type="segment"
    size="medium"
    :theme-overrides="segmentedThemeOverrides"
    :aria-label="ariaLabel"
    @update:value="emit('update:modelValue', String($event))"
  >
    <NTabPane v-for="option in options" :key="option.value" :name="option.value" :disabled="option.disabled" :tab="option.label" :tab-props="{ role: 'tab' }" />
  </NTabs>
</template>

<style scoped>
/* 分段器外槽与输入/按钮同高 32px，内活块留 3px 边 */
.base-segmented { display: inline-flex; width: max-content; max-width: 100%; height: var(--component-control-height-md); min-height: var(--component-control-height-md); overflow: hidden; flex: 0 1 auto; }
.base-segmented :deep(.n-tabs-nav),
.base-segmented :deep(.n-tabs-nav-scroll-wrapper),
.base-segmented :deep(.n-tabs-nav-scroll-content),
.base-segmented :deep(.n-tabs-rail) { width: max-content; height: var(--component-control-height-md); }
.base-segmented :deep(.n-tabs-rail) {
  box-sizing: border-box;
  padding: 3px;
  background: var(--color-surface-subtle);
  border: none;
  border-radius: var(--component-control-radius);
}
.base-segmented :deep(.n-tabs-wrapper),
.base-segmented :deep(.n-tabs-tab-wrapper),
.base-segmented :deep(.n-tabs-tab) { width: auto; min-width: max-content; }
.base-segmented :deep(.n-tabs-tab-wrapper) { flex: 0 0 auto; }
.base-segmented :deep(.n-tab-pane) { display: none; }
.base-segmented :deep(.n-tabs-tab) {
  box-sizing: border-box;
  height: calc(var(--component-control-height-md) - 6px);
  min-height: calc(var(--component-control-height-md) - 6px);
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
  border-radius: calc(var(--component-control-radius) - 3px);
  font-size: var(--component-button-font-size);
  letter-spacing: 0.01em;
}
.base-segmented :deep(.n-tabs-tab:hover) { color: var(--color-text); }
.base-segmented :deep(.n-tabs-tab--active) { color: var(--color-text); font-weight: var(--font-weight-semibold); }
.base-segmented :deep(.n-tabs-capsule) {
  background: var(--color-surface);
  border: none;
  border-radius: calc(var(--component-control-radius) - 3px);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent);
}
</style>
