<script setup lang="ts">
import { computed } from 'vue'
import { NBadge, NTabPane, NTabs } from 'naive-ui'

export interface TabItem {
  label: string
  value: string
  disabled?: boolean
  badge?: string | number
}

const props = withDefaults(defineProps<{
  modelValue: string
  items: TabItem[]
  ariaLabel?: string
}>(), { ariaLabel: '页面标签' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const activeValue = computed(() => props.modelValue)
</script>

<template>
  <NTabs
    class="base-tabs"
    :value="activeValue"
    type="bar"
    size="medium"
    :aria-label="ariaLabel"
    @update:value="emit('update:modelValue', String($event))"
  >
    <NTabPane v-for="item in items" :key="item.value" :name="item.value" :disabled="item.disabled" :tab-props="{ role: 'tab' }">
      <template #tab>
        <span class="base-tabs__tab-label">{{ item.label }}</span>
        <NBadge v-if="item.badge !== undefined" :value="item.badge" type="default" />
      </template>
    </NTabPane>
  </NTabs>
</template>

<style scoped>
.base-tabs { min-width: 0; }
.base-tabs__tab-label { white-space: nowrap; }
</style>
