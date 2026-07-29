<script setup lang="ts">
import { reactive, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseDateTimePicker from '@/components/form/BaseDateTimePicker.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import BaseTextarea from '@/components/form/BaseTextarea.vue'
import type { TodoCreateInput, TodoStatus } from '@/services/modules/todo-service'

const props = defineProps<{
  modelValue: boolean
  creating?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [input: TodoCreateInput]
}>()

const draft = reactive({
  title: '',
  description: '',
  status: 'todo' as TodoStatus,
  remindAt: '',
  submitted: false,
})

const statusOptions = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'doing' },
]

watch(() => props.modelValue, (open) => {
  if (!open) return
  Object.assign(draft, {
    title: '',
    description: '',
    status: 'todo',
    remindAt: '',
    submitted: false,
  })
})

function submit() {
  draft.submitted = true
  if (!draft.title.trim()) return
  emit('submit', {
    title: draft.title.trim(),
    content: draft.description.trim(),
    status: draft.status,
    remindAt: draft.remindAt,
  })
}
</script>

<template>
  <!-- below-overlays：内含日期选择器，对话框需退到 Naive 浮层之下才能点选提醒时间 -->
  <BaseDialog
    :model-value="modelValue"
    title="新建任务"
    width="min(600px, calc(100vw - 32px))"
    below-overlays
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="todo-create-form" @submit.prevent="submit">
      <BaseInput
        v-model="draft.title"
        label="任务标题"
        placeholder="例如：整理 Vue 迁移清单"
        required
        :error="draft.submitted && !draft.title.trim() ? '请输入任务标题' : undefined"
      />
      <BaseTextarea
        v-model="draft.description"
        label="任务描述"
        placeholder="补充目标、背景或完成标准（可选）"
        :rows="4"
      />
      <div class="todo-create-form__grid">
        <BaseSelect
          v-model="draft.status"
          label="初始状态"
          :options="statusOptions"
        />
        <BaseDateTimePicker
          v-model="draft.remindAt"
          label="提醒时间"
          placeholder="可选"
        />
      </div>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="emit('update:modelValue', false)">取消</BaseButton>
      <BaseButton :loading="creating" @click="submit">创建任务</BaseButton>
    </template>
  </BaseDialog>
</template>
