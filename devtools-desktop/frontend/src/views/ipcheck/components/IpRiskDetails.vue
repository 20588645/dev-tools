<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import type { IpCheckResult } from '@/services/modules/ipcheck-service'

const props = defineProps<{ result: IpCheckResult }>()

const sharedTone = computed<'success' | 'warning' | 'danger'>(() => {
  if (props.result.sharedUsersPercent <= 35) return 'success'
  if (props.result.sharedUsersPercent <= 65) return 'warning'
  return 'danger'
})

const proxyLabel = computed(() => {
  if (props.result.vpnDetected) return '检测到 VPN'
  if (props.result.proxyDetected) return '检测到代理'
  return '未发现'
})

const supportTone = computed(() => /限制|风险|高危/.test(props.result.openAiSupport) ? 'warning' : 'success')
</script>

<template>
  <BaseCard class="ip-section-card">
    <section class="ip-section-card__body" aria-labelledby="ip-signal-heading">
      <header class="ip-section-heading">
        <h2 id="ip-signal-heading">网络信号</h2>
        <BaseBadge>{{ result.providerName }}</BaseBadge>
      </header>

      <div class="ip-signal-panel">
        <div class="ip-signal-chart" :title="result.sharedUsersSource">
          <div class="ip-signal-chart__head">
            <span>共享程度</span>
            <strong>{{ result.sharedUsersPercent }}%</strong>
          </div>
          <BaseProgress
            :value="result.sharedUsersPercent"
            :tone="sharedTone"
            label="共享程度"
          />
          <div class="ip-signal-chart__meta">
            <span>{{ result.sharedUsers }} 用户</span>
            <span>{{ result.sharedUsersObserved ? '7 日观测' : '规则估算' }}</span>
          </div>
        </div>

        <div class="ip-signal-nodes" aria-label="网络状态">
          <div class="ip-signal-node" :data-tone="result.proxyDetected ? 'warning' : 'success'">
            <i aria-hidden="true" />
            <span>代理检测</span>
            <strong>{{ proxyLabel }}</strong>
          </div>
          <div class="ip-signal-node" :data-tone="result.nativeIp === '原生 IP' ? 'success' : 'neutral'">
            <i aria-hidden="true" />
            <span>IP 属性</span>
            <strong>{{ result.nativeIp }}</strong>
          </div>
          <div class="ip-signal-node" :data-tone="supportTone">
            <i aria-hidden="true" />
            <span>模型连接</span>
            <strong>{{ result.openAiSupport }}</strong>
          </div>
        </div>
      </div>
    </section>
  </BaseCard>
</template>
