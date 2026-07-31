<script setup lang="ts">
import BaseSideNav from '@/components/navigation/BaseSideNav.vue'

import { SETTINGS_CATEGORIES, type SettingsCategory } from '../composables/useSettings'

defineProps<{ modelValue: SettingsCategory }>()
const emit = defineEmits<{ 'update:modelValue': [value: SettingsCategory] }>()

const items = SETTINGS_CATEGORIES.map(category => ({
  value: category.value,
  label: category.label,
  meta: category.index,
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
    caption="Settings"
    aria-label="设置分类"
    mode="responsive"
    :responsive-breakpoint="1050"
    density="compact"
    @update:model-value="updateValue"
  />
</template>
