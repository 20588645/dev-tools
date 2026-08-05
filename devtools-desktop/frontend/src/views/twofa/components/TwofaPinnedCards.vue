<script setup lang="ts">
import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import type { TwofaAccount } from '@/services/modules/twofa-service'

import { formatTwofaCode, twofaAvatarText } from '../composables/useTwofa'

const props = defineProps<{
  accounts: TwofaAccount[]
  remainingOf: (account: TwofaAccount) => number
}>()

const emit = defineEmits<{ copy: [account: TwofaAccount] }>()

function countdownValue(account: TwofaAccount) {
  return props.remainingOf(account) / (account.period || 30) * 100
}
</script>

<template>
  <section v-if="accounts.length" class="twofa-pinned" aria-label="常用账号">
    <div class="twofa-section-heading">
      <h2>常用</h2>
      <span>收藏的账号会置顶显示，点击即可复制</span>
    </div>
    <div class="twofa-pinned__grid">
      <BaseSelectableItem
        v-for="account in accounts"
        :key="account.id"
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
        <BaseProgress
          class="twofa-countdown"
          shape="circle"
          :size="26"
          :stroke-width="10"
          :value="countdownValue(account)"
          :tone="remainingOf(account) <= 5 ? 'warning' : 'info'"
          :tick-interval="1000"
          :label="`剩余 ${remainingOf(account)} 秒`"
        >
          <span class="twofa-countdown__value">{{ remainingOf(account) }}</span>
        </BaseProgress>
      </BaseSelectableItem>
    </div>
  </section>
</template>
