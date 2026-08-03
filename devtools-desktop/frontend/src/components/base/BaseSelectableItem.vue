<script setup lang="ts">
import { NButton } from 'naive-ui'

withDefaults(defineProps<{
  selected?: boolean
  pressed?: boolean
  disabled?: boolean
  appearance?: 'card' | 'row'
}>(), {
  selected: false,
  pressed: undefined,
  disabled: false,
  appearance: 'card',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <NButton
    text
    block
    attr-type="button"
    class="base-selectable-item"
    :class="[`base-selectable-item--${appearance}`, { 'is-selected': selected }]"
    :disabled="disabled"
    :aria-pressed="pressed"
    @click="emit('click', $event)"
  >
    <slot />
  </NButton>
</template>

<style scoped>
.base-selectable-item.n-button {
  display: grid;
  width: 100%;
  height: auto;
  min-height: var(--base-selectable-min-height, var(--component-control-height));
  justify-content: normal;
  padding: var(--base-selectable-padding, var(--space-3));
  color: var(--color-text-muted);
  text-align: left;
  white-space: normal;
  background: var(--base-selectable-background, transparent);
  border: 1px solid transparent;
  border-radius: var(--base-selectable-radius, var(--radius-md));
  transition:
    color var(--duration-normal) var(--ease-standard),
    background-color var(--duration-normal) var(--ease-standard),
    border-color var(--duration-normal) var(--ease-standard),
    transform var(--duration-normal) var(--ease-standard);
}

.base-selectable-item.n-button:hover:not(.n-button--disabled) {
  color: var(--color-text);
  background: var(--base-selectable-hover-background, var(--color-surface-subtle));
  border-color: var(--base-selectable-hover-border, var(--color-border));
  transform: var(--base-selectable-hover-transform, none);
}

.base-selectable-item.n-button:focus-visible {
  outline: 0;
  box-shadow: var(--component-focus-outline);
}

.base-selectable-item.n-button.is-selected {
  color: var(--color-text);
  background: var(
    --base-selectable-selected-background,
    linear-gradient(135deg, color-mix(in srgb, var(--color-action) 11%, transparent), transparent 72%),
    color-mix(in srgb, var(--color-surface-raised) 48%, transparent)
  );
  border-color: var(--base-selectable-selected-border, color-mix(in srgb, var(--color-action) 42%, var(--color-border)));
  box-shadow: var(--base-selectable-selected-shadow, inset 3px 0 0 var(--color-action));
}

.base-selectable-item--row.n-button {
  border-bottom-color: var(--color-border);
  border-radius: 0;
}

.base-selectable-item--row.n-button:not(.is-selected):hover {
  border-color: transparent;
  border-bottom-color: var(--color-border);
}

.base-selectable-item--row.n-button.is-selected {
  border-radius: var(--base-selectable-selected-radius, var(--radius-md));
}

.base-selectable-item :deep(.n-button__content) {
  display: contents;
  color: inherit;
  text-align: inherit;
  white-space: inherit;
}
</style>
