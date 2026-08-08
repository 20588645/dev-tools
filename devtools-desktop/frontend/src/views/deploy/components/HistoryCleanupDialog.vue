<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import FormField from '@/components/form/FormField.vue'

defineOptions({ name: 'HistoryCleanupDialog' })

defineProps<{
  open: boolean
  keepDays: string
  keepPerProject: string
  running: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:keepDays': [value: string]
  'update:keepPerProject': [value: string]
  submit: []
}>()
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="自动整理历史记录"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="history-cleanup">
      <FormField
        label="保留最近天数"
        for-id="cleanup-keep-days"
        hint="超出此范围的失败记录将被清除"
      >
        <BaseInput
          id="cleanup-keep-days"
          :model-value="keepDays"
          @update:model-value="emit('update:keepDays', $event)"
        />
      </FormField>
      <FormField
        label="每个项目保留成功记录数"
        for-id="cleanup-keep-per-project"
        hint="每个项目最多保留此数量的成功记录（无论时间）"
      >
        <BaseInput
          id="cleanup-keep-per-project"
          :model-value="keepPerProject"
          @update:model-value="emit('update:keepPerProject', $event)"
        />
      </FormField>
      <p class="history-cleanup__warn">整理会连带删除对应的日志文件，且不可恢复。</p>
    </div>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('update:open', false)">取消</BaseButton>
      <BaseButton variant="danger" :disabled="running" @click="emit('submit')">
        {{ running ? '整理中…' : '执行整理' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.history-cleanup { display: grid; gap: var(--space-4); }

.history-cleanup__warn {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}
</style>
