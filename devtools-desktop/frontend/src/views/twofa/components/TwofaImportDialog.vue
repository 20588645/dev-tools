<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseTextarea from '@/components/form/BaseTextarea.vue'
import type { TwofaAccountInput } from '@/services/modules/twofa-service'

import { parseTwofaImportText } from '../twofa-format'

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [items: TwofaAccountInput[]]
}>()

const source = ref('')

const parsed = computed(() => parseTwofaImportText(source.value))
const hasInput = computed(() => source.value.trim().length > 0)

watch(() => props.modelValue, (open) => {
  if (open) source.value = ''
})
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="批量导入账号"
    width="min(560px, calc(100vw - 32px))"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="twofa-import">
      <BaseTextarea
        v-model="source"
        label="导入内容"
        :rows="8"
        placeholder="每行一个 otpauth://totp/... 链接，或粘贴导出的 JSON"
        help-text="支持 otpauth 链接、JSON 数组，以及本页导出的 { accounts: [...] } 文件内容。"
      />
      <p v-if="hasInput" class="twofa-import__result" :class="{ 'is-empty': !parsed.length }">
        {{ parsed.length ? `已解析 ${parsed.length} 个账号` : '没有解析到可导入的账号，请检查格式' }}
      </p>
    </div>
    <template #footer>
      <div class="twofa-form__actions">
        <BaseButton variant="secondary" @click="emit('update:modelValue', false)">取消</BaseButton>
        <BaseButton :disabled="!parsed.length" @click="emit('submit', parsed)">
          导入 {{ parsed.length || '' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
