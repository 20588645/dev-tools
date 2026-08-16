<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'
import type { TwofaAccount, TwofaAccountInput, TwofaAlgorithm } from '@/services/modules/twofa-service'

import { formatTwofaTime } from '../twofa-format'

const props = defineProps<{
  modelValue: boolean
  account: TwofaAccount | null
  groups: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [input: TwofaAccountInput, id: string]
  remove: []
}>()

const draft = reactive({
  issuer: '',
  accountName: '',
  secret: '',
  groupName: '其他',
  algorithm: 'SHA1' as TwofaAlgorithm,
  period: '30',
  digits: '6',
  favorite: false,
})

const isEdit = computed(() => Boolean(props.account))

const algorithmOptions = [
  { label: 'SHA1', value: 'SHA1' },
  { label: 'SHA256', value: 'SHA256' },
  { label: 'SHA512', value: 'SHA512' },
]
const periodOptions = [
  { label: '30 秒', value: '30' },
  { label: '60 秒', value: '60' },
]
const digitsOptions = [
  { label: '6 位', value: '6' },
  { label: '8 位', value: '8' },
]
/** 已有分组作为快捷选项，但分组名可自由输入以便新建 */
const groupSuggestions = computed(() => [...new Set([...props.groups, '其他'])].filter(Boolean))

watch(() => props.modelValue, (open) => {
  if (!open) return
  const account = props.account
  draft.issuer = account?.issuer ?? ''
  draft.accountName = account?.accountName ?? ''
  draft.secret = ''
  draft.groupName = account?.groupName ?? '其他'
  draft.algorithm = account?.algorithm ?? 'SHA1'
  draft.period = String(account?.period ?? 30)
  draft.digits = String(account?.digits ?? 6)
  draft.favorite = account?.favorite ?? false
}, { immediate: true })

function submit() {
  const input: TwofaAccountInput = {
    issuer: draft.issuer.trim(),
    accountName: draft.accountName.trim(),
    // 不再提供标签编辑，但保留已有值：直接透传原 tag，避免编辑时把导入带来的标签清掉
    tag: props.account?.tag ?? '',
    groupName: draft.groupName.trim() || '其他',
    algorithm: draft.algorithm,
    period: Number(draft.period) || 30,
    digits: Number(draft.digits) || 6,
    favorite: draft.favorite,
  }
  // 编辑时留空表示不改密钥，避免把已保存的密钥清掉
  const secret = draft.secret.trim()
  if (secret) input.secret = secret
  emit('submit', input, props.account?.id ?? '')
}
</script>

<template>
  <!-- below-overlays：内含 Select 下拉，对话框需退到 Naive 浮层之下才能点选 -->
  <BaseDialog
    :model-value="modelValue"
    :title="isEdit ? '编辑账号' : '添加账号'"
    below-overlays
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="twofa-form" @submit.prevent="submit">
      <div class="twofa-form__row">
        <BaseInput v-model="draft.issuer" label="发行方" placeholder="例如 GitHub" />
        <BaseInput v-model="draft.accountName" label="账号名" placeholder="例如 ldy@example.com" />
      </div>

      <BaseInput
        v-model="draft.secret"
        label="密钥"
        :placeholder="isEdit ? '留空表示不修改现有密钥' : 'Base32 密钥，例如 JBSWY3DPEHPK3PXP'"
        :help-text="isEdit ? '密钥只保存在本地，且以加密形式存储。' : '密钥仅本地加密保存，不会上传。'"
      />

      <!-- 分组独占一行：它带说明文字和候选 chips，与单行输入并排会高度错位 -->
      <div class="twofa-group-field">
        <BaseInput
          v-model="draft.groupName"
          label="分组"
          placeholder="输入分组名，例如 开发"
          help-text="直接输入即可新建分组，或点下方已有分组。"
        />
        <div v-if="groupSuggestions.length" class="twofa-group-field__suggestions">
          <FilterChip
            v-for="name in groupSuggestions"
            :key="name"
            :label="name"
            :selected="draft.groupName === name"
            @update:selected="$event && (draft.groupName = name)"
          />
        </div>
      </div>

      <div class="twofa-form__row twofa-form__row--triple">
        <BaseSelect v-model="draft.algorithm" label="算法" :options="algorithmOptions" />
        <BaseSelect v-model="draft.period" label="周期" :options="periodOptions" />
        <BaseSelect v-model="draft.digits" label="位数" :options="digitsOptions" />
      </div>

      <BaseCheckbox v-model="draft.favorite" label="加入置顶（会显示在页面顶部的置顶面板）" />

      <div v-if="isEdit && account" class="twofa-form__facts">
        <span>密钥遮罩 <code>{{ account.secretMasked || '—' }}</code></span>
        <span>最近使用 {{ account.lastUsedAt ? formatTwofaTime(account.lastUsedAt) : '未使用' }}</span>
      </div>
    </form>
    <template #footer>
      <div class="twofa-form__actions" :class="{ 'has-remove': isEdit }">
        <BaseButton v-if="isEdit" variant="danger" @click="emit('remove')">删除账号</BaseButton>
        <span class="twofa-form__actions-grow" aria-hidden="true" />
        <BaseButton variant="secondary" @click="emit('update:modelValue', false)">取消</BaseButton>
        <BaseButton @click="submit">{{ isEdit ? '保存' : '添加' }}</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
