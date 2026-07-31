<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { useNotificationStore } from '@/stores/notification'

import IpNetworkDetails from './components/IpNetworkDetails.vue'
import IpQueryBar from './components/IpQueryBar.vue'
import IpResultSummary from './components/IpResultSummary.vue'
import IpRiskDetails from './components/IpRiskDetails.vue'
import IpScenarioGrid from './components/IpScenarioGrid.vue'
import { useIpCheck } from './composables/useIpCheck'
import './ipcheck.css'

defineOptions({ name: 'IpCheckView' })

const {
  query,
  result,
  loading,
  error,
  validationError,
  updatedLabel,
  queryTarget,
  queryCurrent,
  retry,
  clearQuery,
} = useIpCheck()

const notifications = useNotificationStore()

const serviceStatus = computed(() => {
  if (loading.value) return { label: '检测中', status: 'checking' as const }
  if (error.value && !result.value) return { label: '服务暂不可用', status: 'offline' as const }
  if (result.value) return { label: '服务正常', status: 'online' as const }
  return { label: '待检测', status: 'idle' as const }
})

async function copyDetails() {
  if (!result.value) return
  const text = [
    `IP: ${result.value.ip}`,
    `位置: ${result.value.location}`,
    `ASN: ${result.value.asn}`,
    `组织: ${result.value.organization}`,
    `风险: ${result.value.riskScore}/100`,
  ].join('\n')

  try {
    await navigator.clipboard.writeText(text)
    notifications.push('已复制当前 IP 详情', 'success')
  } catch {
    notifications.push('当前环境未开放剪贴板权限', 'error')
  }
}
</script>

<template>
  <PageFrame class="ip-check-view">
    <template #top>
      <PageTop>
        <PageHeader title="纯净检测" description="公网 IP 身份与风险概览">
          <template #icon><span class="ip-check-view__title-dot" /></template>
          <template #actions>
            <StatusIndicator :label="serviceStatus.label" :status="serviceStatus.status" />
          </template>
        </PageHeader>
        <PageToolbar>
          <IpQueryBar
            v-model="query"
            :error="validationError"
            :loading="loading"
            @submit="queryTarget"
            @current="queryCurrent"
            @clear="clearQuery"
          />
        </PageToolbar>
      </PageTop>
    </template>

    <div class="ip-check-results" :aria-busy="loading">
      <BaseCard v-if="loading && !result" class="ip-check-state-card">
        <LoadingState label="正在查询地理与风控数据…" />
      </BaseCard>

      <BaseCard v-else-if="error && !result" class="ip-check-state-card">
        <ErrorState title="纯净检测暂不可用" :description="error" @retry="retry" />
      </BaseCard>

      <BaseCard v-else-if="!result" class="ip-check-state-card">
        <EmptyState title="开始纯净度检测" description="输入 IP 或域名，也可以直接查询当前公网 IP">
          <template #actions><BaseButton @click="queryCurrent">查询我的 IP</BaseButton></template>
        </EmptyState>
      </BaseCard>

      <template v-else>
        <div v-if="error" class="ip-check-inline-error" role="alert">
          <span>刷新失败：{{ error }}</span>
          <BaseButton variant="ghost" size="sm" @click="retry">重试</BaseButton>
        </div>
        <IpResultSummary :key="result.ip" :result="result" :updated-label="updatedLabel" />
        <div class="ip-check-detail-grid">
          <IpNetworkDetails :result="result" @copy="copyDetails" />
          <IpRiskDetails :key="result.ip" :result="result" />
        </div>
        <IpScenarioGrid v-if="result.scenarios.length" :scenarios="result.scenarios" />
        <BaseCard v-else variant="subtle">
          <EmptyState compact title="暂无业务场景建议" description="网络身份和风险结果仍可正常参考" />
        </BaseCard>
        <footer class="ip-check-data-note">
          <span>第三方数据 · 检测结果仅供参考</span>
        </footer>
        <div v-if="loading" class="ip-check-refreshing" role="status">
          <LoadingState compact label="正在更新检测结果…" />
        </div>
      </template>
    </div>
  </PageFrame>
</template>
