<script setup lang="ts">
import BaseSideNav from '@/components/navigation/BaseSideNav.vue'

import { SETTINGS_CATEGORIES, type SettingsCategory } from '../composables/useSettings'

defineProps<{ modelValue: SettingsCategory }>()
const emit = defineEmits<{ 'update:modelValue': [value: SettingsCategory] }>()

const items = SETTINGS_CATEGORIES.map(category => ({
  value: category.value,
  label: category.label,
}))

function updateValue(value: string) {
  emit('update:modelValue', value as SettingsCategory)
}
</script>

<template>
  <BaseSideNav
    class="settings-category-nav"
    :model-value="modelValue"
    :items="items"
    aria-label="设置分类"
    mode="horizontal"
    :responsive="false"
    density="compact"
    @update:model-value="updateValue"
  />
</template>
