<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import type { IpCheckResult } from '@/services/modules/ipcheck-service'

defineProps<{ result: IpCheckResult }>()
defineEmits<{ copy: [] }>()
</script>

<template>
  <BaseCard class="ip-section-card" content-padding="0" content-layout="column">
    <section class="ip-section-card__body" aria-labelledby="ip-network-heading">
      <header class="ip-section-heading">
        <h2 id="ip-network-heading">网络与地理信息</h2>
        <BaseButton variant="ghost" size="sm" @click="$emit('copy')">复制详情</BaseButton>
      </header>
      <dl class="ip-network-list">
        <div class="ip-network-row"><dt>ASN</dt><dd class="ip-mono">{{ result.asn }}</dd></div>
        <div class="ip-network-row"><dt>ASN 所有者</dt><dd :title="result.asnOwner">{{ result.asnOwner }}</dd></div>
        <div class="ip-network-row"><dt>企业 / ISP</dt><dd :title="result.organization">{{ result.organization }}</dd></div>
        <div class="ip-network-row"><dt>线路类型</dt><dd :title="result.lineType">{{ result.lineType }}</dd></div>
        <div class="ip-network-row"><dt>经纬度</dt><dd class="ip-mono">{{ result.coordinates }}</dd></div>
        <div class="ip-network-row"><dt>IPv4 数值</dt><dd class="ip-mono">{{ result.ipNumber }}</dd></div>
      </dl>
    </section>
  </BaseCard>
</template>
