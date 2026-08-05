<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseEntityCard from '@/components/base/BaseEntityCard.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import type { TwofaAccount } from '@/services/modules/twofa-service'

import { formatTwofaCode, twofaAvatarText } from '../composables/useTwofa'
import { formatTwofaTime } from '../twofa-format'

const props = defineProps<{
  account: TwofaAccount
  remaining: number
  expanded: boolean
  copied: boolean
}>()

const emit = defineEmits<{
  toggle: []
  copy: []
  edit: []
  favorite: []
  remove: []
}>()

const avatar = computed(() => twofaAvatarText(props.account))
const code = computed(() => formatTwofaCode(props.account.currentCode))
const period = computed(() => props.account.period || 30)
const countdownValue = computed(() => props.remaining / period.value * 100)
/** 最后 5 秒转警示色，提示这一轮码即将失效 */
const isSoon = computed(() => props.remaining <= 5)
const statusLabel = computed(() => (
  isSoon.value ? '即将刷新' : `${period.value} 秒周期 · 本机生成`
))
const lastUsedLabel = computed(() => (
  props.account.lastUsedAt ? formatTwofaTime(props.account.lastUsedAt) : '未使用'
))
</script>

<template>
  <BaseEntityCard
    :model-value="expanded"
    class="twofa-row-shell"
    :class="{ 'is-open': expanded }"
    density="compact"
    status-placement="footer"
    body-align="stretch"
    details-label="详情"
    :details-aria-label="`${expanded ? '收起' : '展开'} ${account.issuer} 的账号详情`"
    :aria-label="`${account.issuer} ${account.accountName}`"
    @update:model-value="$event !== expanded && emit('toggle')"
  >
    <template #icon>
      <span class="twofa-avatar">{{ avatar }}</span>
    </template>
    <template #title>
      <span class="twofa-row__title">
        <span class="twofa-row__issuer">{{ account.issuer }}</span>
        <span v-if="account.favorite" class="twofa-row__star" aria-label="已收藏">★</span>
      </span>
    </template>
    <template v-if="account.tag" #headerExtra>
      <span class="twofa-row__tag">{{ account.tag }}</span>
    </template>
    <template #subtitle>{{ account.accountName }}</template>

    <div class="twofa-row__countdown">
      <div class="twofa-row__code-line">
        <span class="twofa-row__code" :aria-label="`验证码 ${account.currentCode}`">{{ code }}</span>
        <span class="twofa-row__seconds" :class="{ 'is-warning': isSoon }">{{ remaining }}s</span>
      </div>
      <!-- 线形进度比圆环更克制：卡片里不再出现纯装饰的圆形 -->
      <BaseProgress
        class="twofa-row__bar"
        shape="line"
        :stroke-width="2"
        :value="countdownValue"
        :tone="isSoon ? 'warning' : 'info'"
        :show-indicator="false"
        rail="visible"
        :tick-interval="1000"
        :label="`剩余 ${remaining} 秒`"
      />
    </div>

    <template #status>{{ statusLabel }}</template>

    <template #actions>
      <BaseButton
        size="sm"
        variant="secondary"
        @click="emit('copy')"
      >{{ copied ? '已复制' : '复制' }}</BaseButton>
    </template>

    <template #details>
      <div class="twofa-detail">
        <dl class="twofa-detail__grid">
          <div><dt>算法 / 位数</dt><dd>{{ account.algorithm }} · {{ account.digits }} 位</dd></div>
          <div><dt>周期</dt><dd>{{ period }} 秒</dd></div>
          <div><dt>密钥遮罩</dt><dd>{{ account.secretMasked || '—' }}</dd></div>
          <div><dt>最近使用</dt><dd>{{ lastUsedLabel }}</dd></div>
        </dl>
        <div class="twofa-detail__actions">
          <BaseButton variant="secondary" size="sm" @click="emit('edit')">编辑</BaseButton>
          <BaseButton variant="secondary" size="sm" @click="emit('favorite')">
            {{ account.favorite ? '取消收藏' : '收藏' }}
          </BaseButton>
          <BaseButton variant="danger" size="sm" @click="emit('remove')">删除</BaseButton>
        </div>
      </div>
    </template>
  </BaseEntityCard>
</template>
