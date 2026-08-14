<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import type { IpScenario } from '@/services/modules/ipcheck-service'

defineProps<{ scenarios: IpScenario[] }>()
</script>

<template>
  <BaseCard class="ip-scenario-card" content-padding="0" content-layout="column">
    <section aria-labelledby="ip-scenario-heading">
      <header class="ip-section-heading">
        <h2 id="ip-scenario-heading">业务场景建议</h2>
        <BaseBadge>{{ scenarios.length }} 个场景</BaseBadge>
      </header>
      <div class="ip-scenario-list">
        <article v-for="scenario in scenarios" :key="scenario.name" class="ip-scenario-item">
          <div class="ip-scenario-item__top">
            <span class="ip-scenario-item__name">{{ scenario.name }}</span>
            <BaseBadge :tone="scenario.tone">{{ scenario.advice }}</BaseBadge>
          </div>
          <div class="ip-scenario-item__reason" :title="scenario.description">
            <i aria-hidden="true" /><span>{{ scenario.reason }}</span>
          </div>
        </article>
      </div>
    </section>
  </BaseCard>
</template>
