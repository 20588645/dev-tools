<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'

defineProps<{
  modelValue: string
  error?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
  current: []
  clear: []
}>()
</script>

<template>
  <form class="ip-query-bar" role="search" novalidate @submit.prevent="emit('submit')">
    <label class="ip-query-bar__label" for="ip-check-target">IP 地址或域名</label>
    <BaseInput
      id="ip-check-target"
      class="ip-query-bar__input"
      type="text"
      :model-value="modelValue"
      :error="error"
      placeholder="输入 IPv4、IPv6 或域名"
      autocomplete="off"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #prefix><span class="ip-query-bar__glyph" aria-hidden="true">⌕</span></template>
      <template v-if="modelValue" #suffix>
        <BaseIconButton size="sm" label="清空查询" @click="emit('clear')">×</BaseIconButton>
      </template>
    </BaseInput>
    <BaseButton class="ip-query-bar__action" type="submit" :loading="loading">检测</BaseButton>
    <BaseButton class="ip-query-bar__action" variant="secondary" :disabled="loading" @click="emit('current')">我的 IP</BaseButton>
  </form>
</template>
