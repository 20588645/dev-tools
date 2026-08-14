<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import ScoreRing from '@/components/charts/ScoreRing.vue'
import type { IpCheckResult } from '@/services/modules/ipcheck-service'

const props = defineProps<{
  result: IpCheckResult
  updatedLabel?: string
}>()

const riskTone = computed<'success' | 'warning' | 'danger'>(() => {
  if (props.result.riskScore <= 25) return 'success'
  if (props.result.riskScore <= 50) return 'warning'
  return 'danger'
})

/** 原型概览环显示「纯净度」：风险分越低环越满 */
const purityScore = computed(() => Math.max(0, Math.min(100, 100 - props.result.riskScore)))

const proxyBadge = computed(() => {
  if (props.result.vpnDetected) return { label: '✕ 检测到 VPN', tone: 'danger' as const }
  if (props.result.proxyDetected) return { label: '△ 检测到代理', tone: 'warning' as const }
  return { label: '✓ 无代理特征', tone: 'success' as const }
})

const nativeBadge = computed(() => (
  props.result.nativeIp === '原生 IP'
    ? { label: '✓ 原生 IP', tone: 'success' as const }
    : { label: props.result.nativeIp, tone: 'neutral' as const }
))
</script>

<template>
  <BaseCard class="ip-result-summary" :data-risk-tone="riskTone" content-padding="18px">
    <div class="ip-result-summary__layout">
      <ScoreRing
        :value="purityScore"
        :size="96"
        :stroke-width="11"
        :tone="riskTone"
        label="纯净度评分"
      >
        <span class="ip-result-summary__score">{{ purityScore }}</span>
      </ScoreRing>
      <section class="ip-result-summary__copy" aria-labelledby="ip-result-heading">
        <strong id="ip-result-heading" class="ip-result-summary__verdict">
          {{ result.riskLabel }} · {{ result.ipType }}
        </strong>
        <p class="ip-result-summary__location">
          <span class="ip-result-summary__ip">{{ result.ip }}</span>
          <span>{{ result.location }}</span>
        </p>
        <div class="ip-result-summary__badges">
          <BaseBadge :tone="nativeBadge.tone">{{ nativeBadge.label }}</BaseBadge>
          <BaseBadge :tone="proxyBadge.tone">{{ proxyBadge.label }}</BaseBadge>
          <BaseBadge tone="info">{{ result.sharedUsersLevel }}</BaseBadge>
          <BaseBadge v-if="updatedLabel">{{ updatedLabel }} 更新</BaseBadge>
        </div>
      </section>
    </div>
  </BaseCard>
</template>
