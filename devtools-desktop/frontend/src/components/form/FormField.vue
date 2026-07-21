<script setup lang="ts">
withDefaults(defineProps<{
  forId?: string
  label?: string
  hint?: string
  error?: string
  required?: boolean
}>(), {
  label: undefined,
  hint: undefined,
  error: undefined,
  required: false,
})
</script>

<template>
  <div class="form-field">
    <label v-if="label" class="form-field__label" :for="forId">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <div class="form-field__control"><slot /></div>
    <p v-if="error" class="form-field__message form-field__message--error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="form-field__message">{{ hint }}</p>
  </div>
</template>

<style scoped>
.form-field { display: grid; gap: var(--space-2); }
.form-field__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.form-field__label span { color: var(--color-danger); }
.form-field__control { min-width: 0; }
.form-field__message { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.form-field__message--error { color: var(--color-danger); }
</style>
