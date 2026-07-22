<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import type { IpPuritySummary } from '@/services/modules/home-service'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  purity: IpPuritySummary | null
}>()

defineEmits<{
  open: []
  retry: []
}>()
</script>

<template>
  <section class="g-card purity-card" aria-labelledby="home-purity-title">
    <div class="purity-copy">
      <HomeCardHeader label="Current · IP" title="纯净检查" title-id="home-purity-title">
        <template #action>
          <BaseButton class="g-card-action" variant="ghost" size="sm" @click="$emit('open')">查看详情 →</BaseButton>
        </template>
      </HomeCardHeader>
      <LoadingState v-if="loading" compact label="检查当前 IP…" />
      <ErrorState v-else-if="error" compact title="检查暂不可用" :description="error" @retry="$emit('retry')" />
      <template v-else-if="purity">
        <strong class="purity-ip mono">{{ purity.ip || '—' }}</strong>
        <div class="purity-place">{{ purity.location || '未知位置' }}</div>
        <span class="purity-state">{{ purity.riskLabel || '暂无评级' }}</span>
      </template>
    </div>
    <div v-if="purity && !loading && !error" class="risk-panel" :aria-label="`风险分数 ${purity.riskScore} 分，满分 100 分`">
      <span>RISK SCORE</span>
      <div class="risk-value"><strong>{{ purity.riskScore }}</strong><small>/ 100</small></div>
      <div class="risk-scale" aria-hidden="true">
        <i v-for="index in 5" :key="index" :class="{ active: purity.riskScore > (index - 1) * 20 }" />
      </div>
      <div class="risk-caption"><span>纯净</span><span>高风险</span></div>
    </div>
  </section>
</template>
