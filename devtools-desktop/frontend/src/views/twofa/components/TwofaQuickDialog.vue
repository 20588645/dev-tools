<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import { useInterval } from '@/composables/use-interval'
import { previewTwofaCode, type TwofaAccountInput, type TwofaAlgorithm, type TwofaPreview } from '@/services/modules/twofa-service'
import { useNotificationStore } from '@/stores/notification'

import { formatTwofaCode } from '../composables/useTwofa'

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [input: TwofaAccountInput]
}>()

const notifications = useNotificationStore()

const secret = ref('')
const algorithm = ref<TwofaAlgorithm>('SHA1')
const period = ref('30')
const digits = ref('6')
const preview = ref<TwofaPreview | null>(null)
const querying = ref(false)
const remaining = ref(0)
const errorText = ref('')

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

const canQuery = computed(() => secret.value.trim().length > 0 && !querying.value)
const displayCode = computed(() => (preview.value ? formatTwofaCode(preview.value.code) : ''))

const tickTimer = useInterval(() => {
  if (!preview.value) return
  const next = Math.max(0, Math.ceil((preview.value.expiresAt - Date.now()) / 1000))
  remaining.value = next
  if (next <= 0) void query(true)
}, 1_000, { autoStart: false })

/** 倒计时归零后自动重算，避免用户看到过期的码 */
function startTick() {
  tickTimer.start()
}

async function query(silent = false) {
  const raw = secret.value.trim()
  if (!raw || querying.value) return
  querying.value = true
  errorText.value = ''
  try {
    const result = await previewTwofaCode({
      secret: raw,
      algorithm: algorithm.value,
      period: Number(period.value) || 30,
      digits: Number(digits.value) || 6,
    })
    preview.value = result
    remaining.value = result.remainingSeconds
    // otpauth 链接会带出自己的参数，回填让界面与实际计算一致
    algorithm.value = result.algorithm
    period.value = String(result.period)
    digits.value = String(result.digits)
    startTick()
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '验证码计算失败'
    errorText.value = message
    preview.value = null
    tickTimer.clear()
    if (!silent) notifications.push(message, 'error')
  } finally {
    querying.value = false
  }
}

async function copy() {
  if (!preview.value) return
  try {
    await globalThis.navigator?.clipboard?.writeText(preview.value.code)
    notifications.push('验证码已复制', 'success')
  } catch {
    notifications.push('当前环境不支持剪贴板', 'error')
  }
}

function saveAsAccount() {
  if (!preview.value) return
  emit('save', {
    issuer: preview.value.issuer || '快捷查询',
    accountName: preview.value.accountName || secret.value.trim().slice(0, 12),
    secret: secret.value.trim(),
    algorithm: algorithm.value,
    period: Number(period.value) || 30,
    digits: Number(digits.value) || 6,
    groupName: '其他',
  })
}

watch(() => props.modelValue, (open) => {
  if (open) {
    secret.value = ''
    preview.value = null
    errorText.value = ''
    remaining.value = 0
    algorithm.value = 'SHA1'
    period.value = '30'
    digits.value = '6'
  } else {
    // 关闭即丢弃密钥，不在内存里留存
    secret.value = ''
    preview.value = null
    tickTimer.clear()
  }
})
</script>

<template>
  <!-- below-overlays：内含 Select 下拉，对话框需退到 Naive 浮层之下才能点选 -->
  <BaseDialog
    :model-value="modelValue"
    title="快捷查询验证码"
    width="min(520px, calc(100vw - 32px))"
    below-overlays
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="twofa-quick">
      <BaseInput
        v-model="secret"
        label="密钥"
        placeholder="粘贴 Base32 密钥或 otpauth:// 链接"
        help-text="只用于本次计算，不会保存到本地数据库。"
        @keydown.enter="query()"
      />

      <div class="twofa-form__row twofa-form__row--triple">
        <BaseSelect v-model="algorithm" label="算法" :options="algorithmOptions" />
        <BaseSelect v-model="period" label="周期" :options="periodOptions" />
        <BaseSelect v-model="digits" label="位数" :options="digitsOptions" />
      </div>

      <BaseButton :disabled="!canQuery" :loading="querying" @click="query()">查询验证码</BaseButton>

      <p v-if="errorText" class="twofa-quick__error">{{ errorText }}</p>

      <div v-if="preview" class="twofa-quick__result">
        <div class="twofa-quick__code-line">
          <strong class="twofa-quick__code">{{ displayCode }}</strong>
          <span class="twofa-quick__remaining">{{ remaining }}s</span>
        </div>
        <p class="twofa-quick__meta">
          {{ preview.algorithm }} · {{ preview.digits }} 位 · {{ preview.period }} 秒周期
          <template v-if="preview.issuer"> · {{ preview.issuer }}</template>
        </p>
        <div class="twofa-quick__actions">
          <BaseButton size="sm" @click="copy">复制验证码</BaseButton>
          <BaseButton variant="secondary" size="sm" @click="saveAsAccount">保存为账号</BaseButton>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="twofa-form__actions">
        <BaseButton variant="secondary" @click="emit('update:modelValue', false)">关闭</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
