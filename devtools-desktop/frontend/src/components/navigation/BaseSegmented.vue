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
  tabTextColorActiveSegment: 'var(--color-action)',
  tabTextColorHoverSegment: 'var(--color-text)',
  tabColorSegment: 'var(--component-control-surface)',
  tabPaddingSmallSegment: '2px var(--space-3)',
  tabPaddingMediumSegment: '2px var(--space-3)',
  tabPaddingLargeSegment: '2px var(--space-3)',
  tabPaddingVerticalSmallSegment: '0 var(--space-3)',
  tabPaddingVerticalLargeSegment: '0 var(--space-3)',
  tabFontSizeSmall: 'var(--font-size-xs)',
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
    size="small"
    :theme-overrides="segmentedThemeOverrides"
    :aria-label="ariaLabel"
    @update:value="emit('update:modelValue', String($event))"
  >
    <NTabPane v-for="option in options" :key="option.value" :name="option.value" :disabled="option.disabled" :tab="option.label" :tab-props="{ role: 'tab' }" />
  </NTabs>
</template>

<style scoped>
/* Match the compact, single-row filter groups used by the business pages. */
.base-segmented { display: inline-flex; width: max-content; max-width: 100%; min-height: var(--component-control-height-sm); flex: 0 1 auto; }
.base-segmented :deep(.n-tabs-nav),
.base-segmented :deep(.n-tabs-rail) { width: max-content; }
.base-segmented :deep(.n-tabs-rail) {
  box-sizing: border-box;
  height: var(--component-control-height-sm);
  padding: 2px;
  background: color-mix(in srgb, var(--component-control-surface) 72%, transparent);
  border: 1px solid var(--component-control-border);
  border-radius: var(--radius-pill);
}
.base-segmented :deep(.n-tabs-wrapper),
.base-segmented :deep(.n-tabs-tab-wrapper),
.base-segmented :deep(.n-tabs-tab) { width: auto; min-width: max-content; }
.base-segmented :deep(.n-tabs-tab-wrapper) { flex: 0 0 auto; }
/* Segmented controls are used as a filter, so their empty tab pane must not add vertical space. */
.base-segmented :deep(.n-tab-pane) { display: none; }
.base-segmented :deep(.n-tabs-tab) {
  box-sizing: border-box;
  min-height: calc(var(--component-control-height-sm) - 6px);
  padding: 2px var(--space-3);
  color: var(--color-text-muted);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  letter-spacing: 0.01em;
}
.base-segmented :deep(.n-tabs-tab:hover) { color: var(--color-text); }
.base-segmented :deep(.n-tabs-tab--active) { color: var(--color-action); }
.base-segmented :deep(.n-tabs-capsule) {
  background: color-mix(in srgb, var(--color-action) 12%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-action) 22%, var(--color-border));
  border-radius: var(--radius-pill);
  box-shadow: none;
}
</style>
