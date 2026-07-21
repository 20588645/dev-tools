<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'outline' | 'danger'
  disabled?: boolean
}>(), {
  size: 'md',
  variant: 'ghost',
  disabled: false,
})
</script>

<template>
  <button
    class="base-icon-button"
    :class="[`base-icon-button--${size}`, `base-icon-button--${variant}`]"
    type="button"
    :aria-label="label"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.base-icon-button {
  display: inline-grid;
  place-items: center;
  padding: 0;
  color: var(--color-text-muted);
  border: 1px solid transparent;
  border-radius: var(--component-control-radius);
  cursor: pointer;
}

.base-icon-button--sm { width: var(--component-control-height-sm); height: var(--component-control-height-sm); }
.base-icon-button--md { width: var(--component-control-height-md); height: var(--component-control-height-md); }
.base-icon-button--lg { width: var(--component-control-height-lg); height: var(--component-control-height-lg); }
.base-icon-button--ghost { background: transparent; }
.base-icon-button--outline { background: transparent; border-color: var(--color-border); }
.base-icon-button--danger { color: var(--color-danger); background: var(--color-surface-subtle); }
.base-icon-button:hover:not(:disabled) { color: var(--color-text); background: var(--color-surface-subtle); }
.base-icon-button:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.base-icon-button:disabled { cursor: not-allowed; opacity: 0.5; }
</style>
