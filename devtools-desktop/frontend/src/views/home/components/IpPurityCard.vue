<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import ScoreRing from '@/components/charts/ScoreRing.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import type { IpPuritySummary } from '@/services/modules/home-service'

import HomeCardHeader from './HomeCardHeader.vue'

const props = defineProps<{
  loading: boolean
  error: string
  purity: IpPuritySummary | null
  checkedAt: string
}>()

defineEmits<{
  open: []
  retry: []
}>()

const purityScore = computed(() => props.purity ? Math.max(0, Math.min(100, Math.round(100 - props.purity.riskScore))) : 0)
const scoreTone = computed(() => {
  if (purityScore.value >= 80) return 'success' as const
  if (purityScore.value >= 50) return 'warning' as const
  return 'danger' as const
})
</script>

<template>
  <section class="hcard purity-card" aria-labelledby="home-purity-title">
    <HomeCardHeader title="IP 纯净" title-id="home-purity-title">
      <template #action>
        <BaseButton variant="outline" size="sm" @click="$emit('open')">检测</BaseButton>
      </template>
    </HomeCardHeader>
    <div class="hcard-body">
      <LoadingState v-if="loading" compact label="检查当前 IP…" />
      <ErrorState v-else-if="error" compact title="检查暂不可用" :description="error" @retry="$emit('retry')" />
      <template v-else-if="purity">
        <div class="purity-main">
          <ScoreRing :value="purityScore" :size="104" :stroke-width="12" :tone="scoreTone" label="纯净分">
            <div class="purity-score"><b>{{ purityScore }}</b><span>纯净分</span></div>
          </ScoreRing>
          <div class="purity-facts">
            <div class="purity-fact"><span>类型</span><b>{{ purity.ipType || '—' }}</b></div>
            <div class="purity-fact"><span>归属</span><b>{{ purity.location || '—' }}</b></div>
            <div class="purity-fact"><span>原生 IP</span><b>{{ purity.nativeIp || '—' }}</b></div>
            <div class="purity-fact"><span>检测于</span><b>{{ checkedAt || '—' }}</b></div>
          </div>
        </div>
        <div class="purity-notes">
          <div class="purity-note">{{ purity.riskLabel || '暂无评级' }} · 风险值 {{ purity.riskScore }}/100</div>
          <div class="purity-note is-mono">{{ purity.ip || '—' }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
