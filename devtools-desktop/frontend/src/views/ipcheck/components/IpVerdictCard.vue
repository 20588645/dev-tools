<script setup lang="ts">
import { computed } from 'vue'

import BaseCard from '@/components/base/BaseCard.vue'
import type { IpCheckResult } from '@/services/modules/ipcheck-service'

import { buildIpCheckInsight } from '../ip-check-insight'

const props = defineProps<{ result: IpCheckResult }>()
const insight = computed(() => buildIpCheckInsight(props.result))
</script>

<template>
  <BaseCard class="ip-verdict-card" fill-height content-padding="0" content-layout="fill" content-overflow="hidden">
    <section class="ip-section-card__body" aria-labelledby="ip-verdict-heading">
      <header class="ip-section-heading">
        <h2 id="ip-verdict-heading">风险解读</h2>
        <span class="ip-section-heading__meta">风险 {{ result.riskScore }} / 100</span>
      </header>
      <p class="ip-verdict-headline">{{ insight.headline }}</p>
      <ul class="ip-verdict-list">
        <li v-for="item in insight.checks" :key="item.key" class="ip-verdict-item" :data-tone="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </li>
      </ul>
      <p class="ip-verdict-next">{{ insight.nextStep }}</p>
    </section>
  </BaseCard>
</template>
