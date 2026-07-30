<script setup lang="ts">
import type { TwofaAccount } from '@/services/modules/twofa-service'

import { formatTwofaCode, twofaAvatarText } from '../composables/useTwofa'

defineProps<{
  accounts: TwofaAccount[]
  remainingOf: (account: TwofaAccount) => number
}>()

const emit = defineEmits<{ copy: [account: TwofaAccount] }>()

const CIRCUMFERENCE = 2 * Math.PI * 11
</script>

<template>
  <section v-if="accounts.length" class="twofa-pinned" aria-label="常用账号">
    <div class="twofa-section-heading">
      <h2>常用</h2>
      <span>收藏的账号会置顶显示，点击即可复制</span>
    </div>
    <div class="twofa-pinned__grid">
      <button
        v-for="account in accounts"
        :key="account.id"
        type="button"
        class="twofa-pinned__card"
        :aria-label="`复制 ${account.issuer} 的验证码`"
        @click="emit('copy', account)"
      >
        <span class="twofa-avatar" aria-hidden="true">{{ twofaAvatarText(account) }}</span>
        <span class="twofa-pinned__meta">
          <span class="twofa-pinned__issuer">{{ account.issuer }}</span>
          <span class="twofa-pinned__code">{{ formatTwofaCode(account.currentCode) }}</span>
        </span>
        <!-- 窄窗口下这个环会被隐藏，秒数信息在下方账号行里仍然存在 -->
        <span class="twofa-countdown" :class="{ 'is-soon': remainingOf(account) <= 5 }">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle class="twofa-countdown__track" cx="13" cy="13" r="11" />
            <circle
              class="twofa-countdown__bar"
              cx="13"
              cy="13"
              r="11"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="CIRCUMFERENCE * (1 - remainingOf(account) / (account.period || 30))"
            />
          </svg>
          <span>{{ remainingOf(account) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>
