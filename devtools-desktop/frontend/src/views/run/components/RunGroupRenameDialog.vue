<script setup lang="ts">
import { ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'

defineOptions({ name: 'RunGroupRenameDialog' })

const props = defineProps<{
  /** 待重命名的分组名；null 表示弹窗关闭。 */
  groupKey: string | null
  /** 已有分组名，用于提示「会合并到已存在分组」。 */
  existingNames: string[]
  submitting: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [name: string]
}>()

const name = ref('')
const error = ref('')

watch(() => props.groupKey, (key) => {
  name.value = key ?? ''
  error.value = ''
}, { immediate: true })

/** 改成已存在的分组名等于合并两个分组，值得事先说清而不是默默执行。 */
const willMerge = () => {
  const next = name.value.trim()
  return Boolean(next) && next !== props.groupKey && props.existingNames.includes(next)
}

function onSubmit() {
  const next = name.value.trim()
  if (!next) {
    error.value = '请输入分组名称'
    return
  }
  if (next === props.groupKey) {
    emit('close')
    return
  }
  error.value = ''
  emit('submit', next)
}
</script>

<template>
  <BaseDialog
    :model-value="groupKey !== null"
    title="重命名分组"
    width="min(420px, 92vw)"
    @update:model-value="!$event && emit('close')"
  >
    <BaseInput
      v-model="name"
      label="分组名称"
      placeholder="分组名称"
      :error="error"
      @keydown.enter="onSubmit"
    />
    <p v-if="willMerge()" class="rename__merge">
      「{{ name.trim() }}」已存在，确认后两个分组会合并。
    </p>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" :loading="submitting" @click="onSubmit">保存</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.rename__merge {
  margin: var(--space-2) 0 0;
  color: var(--color-warning);
  font-size: var(--font-size-xs);
}
</style>
