<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { NMenu, type MenuOption } from 'naive-ui'

export interface SideNavItem {
  label: string
  value: string
  meta?: string
  description?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  items: SideNavItem[]
  caption?: string
  ariaLabel?: string
  mode?: 'vertical' | 'horizontal' | 'responsive'
  responsiveBreakpoint?: number
  density?: 'default' | 'compact'
  showMetaInHorizontal?: boolean
}>(), {
  caption: undefined,
  ariaLabel: '页面导航',
  mode: 'vertical',
  responsiveBreakpoint: 980,
  density: 'default',
  showMetaInHorizontal: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const compactViewport = ref(false)
let mediaQuery: MediaQueryList | null = null

const menuMode = computed<'vertical' | 'horizontal'>(() => {
  if (props.mode === 'horizontal') return 'horizontal'
  if (props.mode === 'responsive' && compactViewport.value) return 'horizontal'
  return 'vertical'
})

const options = computed<MenuOption[]>(() => props.items.map(item => ({
  key: item.value,
  disabled: item.disabled,
  label: () => h('span', { class: 'base-side-nav__label' }, [
    item.meta && (menuMode.value === 'vertical' || props.showMetaInHorizontal)
      ? h('span', { class: 'base-side-nav__meta' }, item.meta)
      : null,
    h('span', { class: 'base-side-nav__copy' }, [
      h('strong', item.label),
      item.description ? h('small', item.description) : null,
    ]),
  ]),
})))

const menuThemeOverrides = computed(() => ({
  color: 'transparent',
  borderRadius: 'var(--radius-md)',
  itemHeight: props.density === 'compact' ? '36px' : '44px',
  itemColorHover: 'var(--color-surface-subtle)',
  itemColorActive: 'var(--color-surface-subtle)',
  itemColorActiveHover: 'var(--color-surface-subtle)',
  itemTextColor: 'var(--color-text-muted)',
  itemTextColorHover: 'var(--color-text)',
  itemTextColorActive: 'var(--color-action)',
  itemTextColorActiveHover: 'var(--color-action)',
  fontSize: 'var(--font-size-sm)',
}))

function syncViewport(event?: MediaQueryListEvent) {
  compactViewport.value = event?.matches ?? mediaQuery?.matches ?? false
}

onMounted(() => {
  if (props.mode !== 'responsive' || typeof window.matchMedia !== 'function') return
  mediaQuery = window.matchMedia(`(max-width: ${props.responsiveBreakpoint}px)`)
  syncViewport()
  if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', syncViewport)
  else mediaQuery.addListener(syncViewport)
})

onBeforeUnmount(() => {
  if (!mediaQuery) return
  if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', syncViewport)
  else mediaQuery.removeListener(syncViewport)
  mediaQuery = null
})

function updateValue(value: string | number) {
  emit('update:modelValue', String(value))
}
</script>

<template>
  <nav
    class="base-side-nav"
    :class="[`base-side-nav--${menuMode}`, `base-side-nav--${density}`]"
    :aria-label="ariaLabel"
  >
    <span v-if="caption" class="base-side-nav__caption">{{ caption }}</span>
    <NMenu
      :value="modelValue"
      :options="options"
      :mode="menuMode"
      :responsive="menuMode === 'horizontal'"
      :indent="0"
      :root-indent="menuMode === 'vertical' ? 8 : 0"
      :theme-overrides="menuThemeOverrides"
      @update:value="updateValue"
    />
  </nav>
</template>

<style scoped>
.base-side-nav {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.base-side-nav__caption {
  padding: 0 var(--space-3);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.base-side-nav--horizontal {
  display: block;
  overflow: hidden;
}

.base-side-nav--horizontal .base-side-nav__caption {
  display: none;
}

/* Naive Menu 默认将状态底色左右各缩进 8px。编号属于项目导航项的
   正式内容，因此垂直导航由封装层统一让状态底色覆盖完整内容行。 */
.base-side-nav--vertical :deep(.n-menu-item-content::before) {
  right: 0;
  left: 0;
}

:deep(.base-side-nav__label) {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
}

:deep(.base-side-nav__meta) {
  width: 24px;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

:deep(.base-side-nav__copy) {
  display: grid;
  min-width: 0;
}

:deep(.base-side-nav__copy strong) {
  overflow: hidden;
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.base-side-nav__copy small) {
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
