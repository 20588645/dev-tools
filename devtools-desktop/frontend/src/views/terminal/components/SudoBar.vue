<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'

defineProps<{
  password: string
  configured: boolean
}>()

const emit = defineEmits<{
  'update:password': [value: string]
  save: []
}>()
</script>

<template>
  <div class="term-sudo-bar">
    <BaseInput
      :model-value="password"
      type="password"
      size="sm"
      placeholder="sudo 密码（用于自动执行需要权限的命令）"
      aria-label="sudo 密码"
      class="term-sudo-bar__input"
      @update:model-value="emit('update:password', $event)"
      @keydown.enter="emit('save')"
    />
    <BaseButton variant="secondary" size="sm" @click="emit('save')">保存</BaseButton>
    <span
      class="term-sudo-bar__status"
      :class="configured ? 'is-ok' : 'is-warn'"
    >
      {{ configured ? '已配置' : '未配置' }}
    </span>
  </div>
</template>
