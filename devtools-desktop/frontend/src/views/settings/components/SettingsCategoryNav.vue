<script setup lang="ts">
import { SETTINGS_CATEGORIES, type SettingsCategory } from '../composables/useSettings'

defineProps<{ modelValue: SettingsCategory }>()
const emit = defineEmits<{ 'update:modelValue': [value: SettingsCategory] }>()
</script>

<template>
  <nav class="settings-category-nav" aria-label="设置分类">
    <span class="settings-category-nav__caption">Settings</span>
    <button
      v-for="category in SETTINGS_CATEGORIES"
      :key="category.value"
      type="button"
      class="settings-category-nav__item"
      :class="{ 'is-active': modelValue === category.value }"
      :aria-current="modelValue === category.value ? 'page' : undefined"
      @click="emit('update:modelValue', category.value)"
    >
      <span>{{ category.index }}</span>
      <strong>{{ category.label }}</strong>
    </button>
  </nav>
</template>
