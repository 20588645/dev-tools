<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
})

const classes = computed(() => [
  `base-button--${props.variant}`,
  `base-button--${props.size}`,
])
</script>

<template>
  <button
    class="base-button"
    :class="classes"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="base-button__spinner" aria-hidden="true" />
    <span :class="{ 'base-button__content--loading': loading }"><slot /></span>
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--component-control-radius);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-standard), border-color var(--duration-normal) var(--ease-standard), color var(--duration-normal) var(--ease-standard);
}

.base-button:focus-visible {
  outline: none;
  box-shadow: var(--component-focus-outline);
}

.base-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.base-button--sm { min-height: var(--component-control-height-sm); padding: 0 var(--space-3); }
.base-button--md { min-height: var(--component-control-height-md); padding: 0 var(--space-4); }
.base-button--lg { min-height: var(--component-control-height-lg); padding: 0 var(--space-5); }

.base-button--primary {
  color: var(--color-action-contrast);
  background: var(--color-action);
}

.base-button--primary:hover:not(:disabled) { background: var(--color-action-hover); }
.base-button--secondary { color: var(--color-text); background: var(--color-surface-raised); }
.base-button--secondary:hover:not(:disabled) { background: var(--color-surface-subtle); }
.base-button--outline { color: var(--color-text); background: transparent; border-color: var(--color-border-strong); }
.base-button--outline:hover:not(:disabled) { border-color: var(--color-action); color: var(--color-action-hover); }
.base-button--ghost { color: var(--color-text-muted); background: transparent; }
.base-button--ghost:hover:not(:disabled) { color: var(--color-text); background: var(--color-surface-subtle); }
.base-button--danger { color: var(--color-action-contrast); background: var(--color-danger); }

.base-button__spinner {
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: var(--radius-pill);
  animation: button-spin 700ms linear infinite;
}

.base-button__content--loading { opacity: 0.75; }

@keyframes button-spin { to { transform: rotate(360deg); } }
</style>
