<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import type { IpCheckResult } from '@/services/modules/ipcheck-service'

import { buildNetworkRows } from '../ip-check-insight'

const props = defineProps<{ result: IpCheckResult }>()
defineEmits<{ copy: [] }>()

const rows = computed(() => buildNetworkRows(props.result))
const geoLabel = computed(() => (
  [props.result.countryCode, props.result.location].filter(Boolean).join(' · ') || props.result.location
))
</script>

<template>
  <BaseCard class="ip-network-card" fill-height content-padding="0" content-layout="fill" content-overflow="hidden">
    <section class="ip-section-card__body" aria-labelledby="ip-network-heading">
      <header class="ip-section-heading">
        <h2 id="ip-network-heading">网络与地理信息</h2>
        <BaseButton variant="ghost" size="sm" @click="$emit('copy')">复制详情</BaseButton>
      </header>
      <div class="ip-geo-hero">
        <strong class="ip-geo-hero__code">{{ result.countryCode || '—' }}</strong>
        <div class="ip-geo-hero__copy">
          <span>{{ geoLabel }}</span>
          <span class="ip-mono">{{ result.coordinates }}</span>
        </div>
      </div>
      <dl class="ip-network-list">
        <div v-for="row in rows" :key="row.key" class="ip-network-row">
          <dt>{{ row.label }}</dt>
          <dd :class="{ 'ip-mono': row.mono }" :title="row.value">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
  </BaseCard>
</template>
