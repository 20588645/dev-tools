<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseCard from '@/components/base/BaseCard.vue'
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

const riskVerdict = computed(() => {
  if (props.result.riskScore <= 15) return '当前风险很低'
  if (props.result.riskScore <= 25) return '当前风险较低'
  if (props.result.riskScore <= 50) return '建议保持关注'
  return '当前风险较高'
})
</script>

<template>
  <BaseCard class="ip-result-summary" :data-risk-tone="riskTone">
    <div class="ip-result-summary__grid">
      <section class="ip-result-summary__identity" aria-labelledby="ip-result-heading">
        <span id="ip-result-heading" class="ip-eyebrow">当前网络身份</span>
        <strong class="ip-result-summary__ip">{{ result.ip }}</strong>
        <p class="ip-result-summary__location">{{ result.location }}</p>
        <div class="ip-result-summary__badges">
          <BaseBadge :tone="riskTone">{{ result.riskLabel }}</BaseBadge>
          <BaseBadge tone="info">{{ result.ipType }}</BaseBadge>
          <BaseBadge>{{ result.nativeIp }}</BaseBadge>
          <BaseBadge v-if="updatedLabel">{{ updatedLabel }} 更新</BaseBadge>
        </div>
      </section>
      <section class="ip-result-summary__risk" aria-label="综合风险">
        <div class="ip-risk-readout">
          <div class="ip-risk-readout__number"><strong>{{ result.riskScore }}</strong><span>/ 100</span></div>
          <span class="ip-risk-readout__verdict">{{ riskVerdict }}</span>
        </div>
        <div class="ip-risk-meter-wrap">
          <div class="ip-risk-meter__head"><span>综合风险</span><span>越低越稳定</span></div>
          <div
            class="ip-risk-meter"
            role="meter"
            aria-label="综合风险"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="result.riskScore"
          >
            <i :style="{ width: `${Math.max(2, result.riskScore)}%` }" />
          </div>
          <div class="ip-risk-meter__thresholds"><span>纯净 0</span><span>关注 25</span><span>风险 50</span><span>高风险 100</span></div>
          <div class="ip-risk-meter__source"><i aria-hidden="true" /><span>数据源 {{ result.providerName }}</span></div>
        </div>
      </section>
    </div>
  </BaseCard>
</template>
