<script setup lang="ts">
defineProps<{
  title: string
  hint?: string
  titleId?: string
}>()
</script>

<template>
  <div class="hcard-head">
    <h2 :id="titleId" class="hcard-title">{{ title }}</h2>
    <span v-if="hint" class="hcard-hint">{{ hint }}</span>
    <span class="hcard-grow" />
    <slot name="action" />
  </div>
</template>
