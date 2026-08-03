<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'
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
const lastUsedLabel = computed(() => (
  props.account.lastUsedAt ? formatTwofaTime(props.account.lastUsedAt) : '未使用'
))
</script>

<template>
  <BaseDisclosure
    :model-value="expanded"
    class="twofa-row-shell"
    :class="{ 'is-open': expanded }"
    variant="card"
    arrow-placement="right"
    header-padding="10px 0"
    content-gap="0"
    content-padding="0"
    @update:model-value="$event !== expanded && emit('toggle')"
  >
    <template #header>
      <span
        class="twofa-row"
        :aria-label="`${account.issuer} ${account.accountName}`"
      >
        <span class="twofa-avatar" aria-hidden="true">{{ avatar }}</span>

        <span class="twofa-row__meta">
          <span class="twofa-row__title">
            <span class="twofa-row__issuer">{{ account.issuer }}</span>
            <span v-if="account.favorite" class="twofa-row__star" aria-label="已收藏">★</span>
            <span v-if="account.tag" class="twofa-row__tag">{{ account.tag }}</span>
          </span>
          <span class="twofa-row__account">{{ account.accountName }}</span>
        </span>

        <span class="twofa-row__code" :aria-label="`验证码 ${account.currentCode}`">{{ code }}</span>

        <BaseProgress
          class="twofa-countdown"
          shape="circle"
          :size="26"
          :stroke-width="10"
          :value="countdownValue"
          :tone="isSoon ? 'warning' : 'info'"
          :label="`剩余 ${remaining} 秒`"
        >
          <span class="twofa-countdown__value">{{ remaining }}</span>
        </BaseProgress>
      </span>
    </template>

    <template #actions>
      <BaseButton
        size="sm"
        :variant="copied ? 'secondary' : 'primary'"
        @click="emit('copy')"
      >{{ copied ? '已复制' : '复制' }}</BaseButton>
    </template>

    <!-- 详情紧贴所属行展开，取代原先在窄窗口会被推到列表末尾的固定右栏 -->
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
  </BaseDisclosure>
</template>
