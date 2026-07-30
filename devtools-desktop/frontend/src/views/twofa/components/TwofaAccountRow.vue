<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
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

const CIRCUMFERENCE = 2 * Math.PI * 11

const avatar = computed(() => twofaAvatarText(props.account))
const code = computed(() => formatTwofaCode(props.account.currentCode))
const period = computed(() => props.account.period || 30)
const dashOffset = computed(() => CIRCUMFERENCE * (1 - props.remaining / period.value))
/** 最后 5 秒转警示色，提示这一轮码即将失效 */
const isSoon = computed(() => props.remaining <= 5)
const lastUsedLabel = computed(() => (
  props.account.lastUsedAt ? formatTwofaTime(props.account.lastUsedAt) : '未使用'
))
</script>

<template>
  <div class="twofa-row-shell" :class="{ 'is-open': expanded }">
    <div
      class="twofa-row"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      :aria-label="`${account.issuer} ${account.accountName}`"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
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

      <span class="twofa-countdown" :class="{ 'is-soon': isSoon }" :aria-label="`剩余 ${remaining} 秒`">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle class="twofa-countdown__track" cx="13" cy="13" r="11" />
          <circle
            class="twofa-countdown__bar"
            cx="13"
            cy="13"
            r="11"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <span>{{ remaining }}</span>
      </span>

      <span class="twofa-row__actions">
        <BaseButton
          size="sm"
          :variant="copied ? 'secondary' : 'primary'"
          @click.stop="emit('copy')"
        >{{ copied ? '已复制' : '复制' }}</BaseButton>
        <span class="twofa-row__chevron" aria-hidden="true">⌄</span>
      </span>
    </div>

    <!-- 详情紧贴所属行展开，取代原先在窄窗口会被推到列表末尾的固定右栏 -->
    <div v-if="expanded" class="twofa-detail">
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
  </div>
</template>
