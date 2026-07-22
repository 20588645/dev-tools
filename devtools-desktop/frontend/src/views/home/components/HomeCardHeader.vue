<script setup lang="ts">
defineProps<{
  label: string
  title: string
  hint?: string
  titleId?: string
}>()
</script>

<template>
  <div class="g-head">
    <div>
      <span class="g-label">{{ label }}</span>
      <h2 :id="titleId">{{ title }}</h2>
    </div>
    <slot name="action"><span v-if="hint" class="g-hint">{{ hint }}</span></slot>
  </div>
</template>
