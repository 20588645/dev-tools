<script setup lang="ts">
import { computed } from 'vue'

import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import type { TwofaAccount } from '@/services/modules/twofa-service'

import { formatTwofaCode } from '../composables/useTwofa'

const props = defineProps<{
  account: TwofaAccount
  remaining: number
  copied: boolean
}>()

const emit = defineEmits<{
  copy: []
  edit: []
  favorite: []
}>()

const code = computed(() => formatTwofaCode(props.account.currentCode))
const period = computed(() => props.account.period || 30)
const countdownValue = computed(() => props.remaining / period.value * 100)
/** 最后 5 秒转警示色，提示这一轮码即将失效 */
const isSoon = computed(() => props.remaining <= 5)
</script>

<template>
  <BaseSelectableItem
    class="twofa-code-card"
    :class="{ 'is-copied': copied }"
    :aria-label="`复制 ${account.issuer} 的验证码，剩余 ${remaining} 秒`"
    @click="emit('copy')"
  >
    <span class="twofa-code-card__name">
      <strong>{{ account.issuer }}</strong>
      <span v-if="account.tag" class="twofa-code-card__tag">{{ account.tag }}</span>
      <span class="twofa-code-card__tools" @click.stop>
        <BaseIconButton
          class="twofa-code-card__star"
          :class="{ 'is-on': account.favorite }"
          :label="account.favorite ? `取消置顶 ${account.issuer}` : `置顶 ${account.issuer}`"
          size="sm"
          @click="emit('favorite')"
        >{{ account.favorite ? '★' : '☆' }}</BaseIconButton>
        <BaseIconButton
          class="twofa-code-card__edit"
          :label="`编辑 ${account.issuer}`"
          size="sm"
          @click="emit('edit')"
        >✎</BaseIconButton>
      </span>
    </span>
    <span class="twofa-code-card__code" :class="{ 'is-soon': isSoon }">
      {{ copied ? '已复制' : code }}
    </span>
    <span class="twofa-code-card__issuer">
      <span class="twofa-code-card__account">{{ account.accountName }}</span>
      <span class="twofa-code-card__seconds" :class="{ 'is-warning': isSoon }">{{ remaining }}s</span>
    </span>
    <!-- 原型 .fa-count：主题渐变倒计时条（4px 全宽 + 可见轨道），最后 5 秒转警示红 -->
    <BaseProgress
      class="twofa-code-card__count"
      shape="line"
      :stroke-width="4"
      :value="countdownValue"
      :tone="isSoon ? 'danger' : 'action'"
      :show-indicator="false"
      rail="visible"
      :tick-interval="1000"
      :label="`剩余 ${remaining} 秒`"
    />
  </BaseSelectableItem>
</template>
