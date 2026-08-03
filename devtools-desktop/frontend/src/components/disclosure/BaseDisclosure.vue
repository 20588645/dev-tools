<script setup lang="ts">
import { computed, useId } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  disabled?: boolean
  variant?: 'default' | 'card' | 'plain'
  lazy?: boolean
  arrowPlacement?: 'left' | 'right'
  headerPadding?: string
  headerMinHeight?: string
  contentGap?: string
  contentPadding?: string
}>(), {
  title: undefined,
  disabled: false,
  variant: 'default',
  lazy: false,
  arrowPlacement: 'left',
  headerPadding: 'var(--space-3) 0',
  headerMinHeight: undefined,
  contentGap: 'var(--space-4)',
  contentPadding: '0 0 var(--space-3)',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const itemName = 'base-disclosure-content'
const generatedId = useId()
const contentId = `base-disclosure-${generatedId}`
const expandedNames = computed(() => props.modelValue ? [itemName] : [])

const disclosureThemeOverrides = computed(() => ({
  dividerColor: props.variant === 'plain' ? 'transparent' : 'var(--color-border)',
  titleTextColor: 'var(--color-text)',
  titleTextColorDisabled: 'var(--color-text-subtle)',
  textColor: 'var(--color-text)',
  arrowColor: 'var(--color-text-muted)',
  arrowColorDisabled: 'var(--color-text-subtle)',
  titleFontSize: 'var(--font-size-sm)',
  titleFontWeight: 'var(--font-weight-semibold)',
  fontSize: 'var(--font-size-sm)',
  itemMargin: '0',
  titlePadding: props.headerPadding,
}))

function updateExpanded(names: string | number | Array<string | number> | null) {
  emit('update:modelValue', Array.isArray(names) ? names.includes(itemName) : names === itemName)
}
</script>

<template>
  <NCollapse
    class="base-disclosure"
    :class="`base-disclosure--${variant}`"
    :expanded-names="expandedNames"
    :arrow-placement="arrowPlacement"
    :display-directive="lazy ? 'if' : 'show'"
    :trigger-areas="['main', 'arrow']"
    :theme-overrides="disclosureThemeOverrides"
    :style="{ '--base-disclosure-content-gap': contentGap }"
    @update:expanded-names="updateExpanded"
  >
    <NCollapseItem :name="itemName" :disabled="disabled">
      <template #header="{ collapsed }">
        <button
          type="button"
          class="base-disclosure__trigger"
          :style="{ minHeight: headerMinHeight }"
          :disabled="disabled"
          :aria-expanded="!collapsed"
          :aria-controls="contentId"
          @click.stop="emit('update:modelValue', collapsed)"
        >
          <slot name="header" :expanded="!collapsed">
            <span class="base-disclosure__title">{{ title }}</span>
          </slot>
        </button>
      </template>
      <template v-if="$slots.actions" #header-extra="{ collapsed }">
        <div class="base-disclosure__actions" @click.stop>
          <slot name="actions" :expanded="!collapsed" />
        </div>
      </template>
      <div :id="contentId" class="base-disclosure__content" :style="{ padding: contentPadding }">
        <slot />
      </div>
    </NCollapseItem>
  </NCollapse>
</template>

<style scoped>
.base-disclosure {
  min-width: 0;
}

.base-disclosure--card {
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}

.base-disclosure__title {
  color: var(--color-text);
}

.base-disclosure__trigger {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.base-disclosure__trigger:focus-visible {
  border-radius: var(--radius-sm);
  box-shadow: var(--component-focus-outline);
  outline: 0;
}

.base-disclosure__trigger:disabled {
  cursor: not-allowed;
}

.base-disclosure__actions {
  display: flex;
  gap: var(--space-1);
  align-items: center;
}

.base-disclosure__content {
  min-width: 0;
}

.base-disclosure.base-disclosure :deep(.n-collapse-item__content-inner) {
  padding-top: var(--base-disclosure-content-gap);
}
</style>
