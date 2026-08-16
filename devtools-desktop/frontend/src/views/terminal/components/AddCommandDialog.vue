<script setup lang="ts">
import { ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { name: string; command: string; icon: string }]
}>()

const name = ref('')
const command = ref('')
const icon = ref('⚡')
const error = ref('')
const nameInput = ref<{ focus: () => void } | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  name.value = ''
  command.value = ''
  icon.value = '⚡'
  error.value = ''
  globalThis.setTimeout(() => nameInput.value?.focus(), 50)
})

function close() {
  emit('update:open', false)
}

function submit() {
  const n = name.value.trim()
  const c = command.value.trim()
  if (!n || !c) {
    error.value = '名称和命令不能为空'
    return
  }
  emit('submit', { name: n, command: c, icon: icon.value.trim() || '⚡' })
  close()
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="添加快捷命令"
    size="compact"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="term-add-dialog">
      <BaseInput
        ref="nameInput"
        v-model="name"
        label="命令名称"
        placeholder="如：杀端口进程"
        :error="error && !name.trim() ? error : undefined"
      />
      <BaseInput
        v-model="command"
        label="Shell 命令"
        placeholder="支持 ${param} 占位符"
        :error="error && !command.trim() ? error : undefined"
      />
      <BaseInput
        v-model="icon"
        label="图标"
        placeholder="emoji（默认 ⚡）"
      />
      <p v-if="error" class="term-add-dialog__error">{{ error }}</p>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="close">取消</BaseButton>
      <BaseButton variant="primary" @click="submit">添加</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.term-add-dialog {
  display: grid;
  gap: var(--space-3);
}

.term-add-dialog__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}
</style>
