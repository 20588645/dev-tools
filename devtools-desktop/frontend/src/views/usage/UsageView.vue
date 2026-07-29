<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseDateTimePicker from '@/components/form/BaseDateTimePicker.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import BaseSegmented from '@/components/navigation/BaseSegmented.vue'
import type { UsageApp } from '@/services/modules/usage-service'

import UsageDataExplorer from './components/UsageDataExplorer.vue'
import UsageProjectRanking from './components/UsageProjectRanking.vue'
import UsageRequestRanking from './components/UsageRequestRanking.vue'
import UsageSettingsDialog from './components/UsageSettingsDialog.vue'
import UsageTokenComposition from './components/UsageTokenComposition.vue'
import UsageTrendChart from './components/UsageTrendChart.vue'
import { USAGE_REFRESH_OPTIONS, useUsage, type UsageRange } from './composables/useUsage'
import {
  formatUsageCompact,
  formatUsageNumber,
  formatUsagePercent,
  usageDelta,
} from './usage-format'
import './usage.css'

defineOptions({ name: 'UsageView' })

const {
  range,
  customRange,
  refreshSeconds,
  setRefreshSeconds,
  setCustomRange,
  app,
  explorerTab,
  summary,
  previousSummary,
  models,
  sortedProjects,
  topRequests,
  claudeTrends,
  codexTrends,
  logs,
  logModel,
  modelOptions,
  pricing,
  pricingSyncResult,
  subscriptionFee,
  loading,
  error,
  refreshing,
  scanning,
  importing,
  pricingLoading,
  pricingSyncing,
  status,
  priced,
  refresh,
  loadPricing,
  syncPricing,
  savePricing,
  forceScan,
  importHistory,
  saveSubscriptionFee,
  setLogPage,
  setLogModel,
} = useUsage()

const settingsOpen = ref(false)
const rangeOptions = [
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '本月', value: 'month' },
  { label: '全部', value: 'all' },
  { label: '自定义', value: 'custom' },
]

const customOpen = ref(false)
const customStart = ref('')
const customEnd = ref('')
const customFollowNow = ref(true)

const toSeconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

const customLabel = computed(() => {
  if (range.value !== 'custom' || !customRange.value) return '自定义区间'
  const fmt = (seconds: number) => new Date(seconds * 1000)
    .toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const { start, end } = customRange.value
  return `${fmt(start)} → ${end ? fmt(end) : '当前'}`
})

const customValid = computed(() => {
  if (!customStart.value) return false
  const start = toSeconds(customStart.value)
  if (!Number.isFinite(start)) return false
  if (customFollowNow.value) return true
  if (!customEnd.value) return false
  const end = toSeconds(customEnd.value)
  return Number.isFinite(end) && end > start
})

function openCustomPanel() {
  // 带入当前区间做初值，避免每次从空白开始选
  const info = customRange.value
  if (info) {
    customStart.value = new Date(info.start * 1000).toISOString()
    customEnd.value = info.end ? new Date(info.end * 1000).toISOString() : ''
    customFollowNow.value = !info.end
  } else {
    const now = new Date()
    customStart.value = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    customEnd.value = ''
    customFollowNow.value = true
  }
  customOpen.value = true
}

function applyCustomRange() {
  if (!customValid.value) return
  setCustomRange({
    start: toSeconds(customStart.value),
    end: customFollowNow.value ? 0 : toSeconds(customEnd.value),
  })
  customOpen.value = false
}

function onRangeChange(value: string) {
  if (value === 'custom') {
    openCustomPanel()
    return
  }
  range.value = value as UsageRange
}
const appOptions = [
  { label: '全部应用', value: '' },
  { label: 'Claude Code', value: 'claude' },
  { label: 'Codex', value: 'codex' },
]

const tokenDelta = computed(() => usageDelta(summary.value.totalTokens, previousSummary.value?.totalTokens ?? 0))
const requestDelta = computed(() => usageDelta(summary.value.requests, previousSummary.value?.requests ?? 0))
const cacheInputRatio = computed(() => summary.value.cacheHitRate)
const coverageTone = computed(() => summary.value.pricingCoverage >= 1 ? 'is-success' : summary.value.pricingCoverage > 0 ? 'is-partial' : '')

function deltaLabel(value: number | null) {
  if (value === null) return '暂无对照'
  const arrow = value >= 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(value * 100).toFixed(1)}%`
}
</script>

<template>
  <PageFrame class="usage-view" variant="workspace" data-test="usage-view">
    <template #top>
      <PageTop>
        <PageHeader title="用量统计">
          <template #icon><span class="usage-view__title-mark">▥</span></template>
          <template #actions>
            <StatusIndicator :label="status.label" :status="status.status" />
            <!--
              「导入 CC Switch 历史」是早期一次性迁移旧数据用的入口，日常不需要。
              暂时隐藏按钮但保留 importHistory 及其 service，后续需要再导入时改回 v-if="true" 即可。
            -->
            <BaseButton v-if="false" variant="secondary" :loading="importing" @click="importHistory">导入 CC Switch 历史</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="usage-toolbar">
            <div class="usage-toolbar__filters">
              <BaseSegmented
                :model-value="range"
                :options="rangeOptions"
                aria-label="用量日期范围"
                @update:model-value="onRangeChange($event as string)"
              />
              <BaseButton
                v-if="range === 'custom'"
                variant="ghost"
                size="sm"
                class="usage-custom-chip"
                @click="openCustomPanel"
              >
                {{ customLabel }}
              </BaseButton>
              <span class="usage-toolbar__divider" aria-hidden="true" />
              <BaseSegmented
                :model-value="app"
                :options="appOptions"
                aria-label="用量应用范围"
                @update:model-value="app = $event as UsageApp"
              />
            </div>
            <div class="usage-toolbar__actions">
              <BaseSelect
                :model-value="String(refreshSeconds)"
                :options="USAGE_REFRESH_OPTIONS"
                aria-label="自动刷新间隔"
                class="usage-refresh-select"
                @update:model-value="setRefreshSeconds(Number($event))"
              />
              <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="refresh(true)">刷新数据</BaseButton>
              <BaseButton variant="ghost" size="sm" :loading="scanning" @click="forceScan">重新扫描</BaseButton>
            </div>
          </div>
        </PageToolbar>
      </PageTop>
    </template>

    <div class="usage-view__scroll">
      <LoadingState v-if="loading && !summary.requests" label="正在读取本地用量数据…" />
      <ErrorState
        v-else-if="error && !summary.requests"
        title="用量数据加载失败"
        :description="error"
        @retry="refresh()"
      />
      <div v-else class="usage-dashboard">
        <BaseCard class="usage-overview" content-padding="0">
          <section class="usage-overview__trend" aria-labelledby="usage-total-title">
            <div class="usage-primary-metric">
              <div>
                <span id="usage-total-title">总 Token</span>
                <strong>{{ formatUsageNumber(summary.totalTokens) }}</strong>
                <small>
                  ≈ {{ formatUsageCompact(summary.totalTokens) }}
                  <b :class="{ 'is-negative': tokenDelta !== null && tokenDelta < 0 }">{{ deltaLabel(tokenDelta) }}</b>
                </small>
              </div>
            </div>
            <UsageTrendChart :claude="claudeTrends" :codex="codexTrends" :range="range" />
          </section>

          <aside class="usage-insights" aria-label="关键用量指标">
            <article>
              <span class="usage-insight-icon">⌁</span>
              <div>
                <small>请求总数</small>
                <strong>{{ formatUsageNumber(summary.requests) }}</strong>
                <span>{{ deltaLabel(requestDelta) }}</span>
              </div>
            </article>
            <article>
              <!-- 缓存占比是中性指标，不是「成功」状态，用系列色而非语义绿 -->
              <span class="usage-insight-icon is-series">◫</span>
              <div>
                <small>缓存输入占比</small>
                <strong>{{ formatUsagePercent(cacheInputRatio) }}</strong>
                <BaseProgress :value="cacheInputRatio * 100" label="缓存输入占比" />
              </div>
            </article>
            <article>
              <span class="usage-insight-icon is-warning">◇</span>
              <div>
                <small>单价覆盖率</small>
                <strong>{{ formatUsagePercent(summary.pricingCoverage) }}</strong>
                <span>{{ formatUsageNumber(summary.pricedRequests) }} / {{ formatUsageNumber(summary.requests) }} 个请求</span>
              </div>
            </article>
            <div class="usage-pricing-state" :class="coverageTone">
              <span>{{ summary.pricingCoverage >= 1 ? '✓' : '!' }}</span>
              <div>
                <strong>{{ summary.pricingCoverage >= 1 ? '成本数据完整' : '成本暂不可完全计算' }}</strong>
                <p>{{ summary.pricingCoverage > 0 ? '部分请求已匹配单价，成本只代表已覆盖部分。' : '同步在线价格或手动补充未匹配模型单价。' }}</p>
                <button type="button" @click="settingsOpen = true">查看价格设置 →</button>
              </div>
            </div>
          </aside>
        </BaseCard>

        <BaseCard><UsageTokenComposition :summary="summary" /></BaseCard>

        <div class="usage-lower-grid">
          <BaseCard><UsageProjectRanking :projects="sortedProjects" /></BaseCard>
          <BaseCard><UsageRequestRanking :rows="topRequests" :priced="priced" /></BaseCard>
        </div>

        <BaseCard content-padding="0">
          <UsageDataExplorer
            :active-tab="explorerTab"
            :models="models"
            :logs="logs"
            :log-model="logModel"
            :model-options="modelOptions"
            :priced="priced"
            @update:active-tab="explorerTab = $event"
            @update:log-model="setLogModel"
            @page="setLogPage"
            @open-settings="settingsOpen = true"
          />
        </BaseCard>
      </div>
    </div>

    <!-- below-overlays：内含日期选择器，对话框需退到 Naive 浮层之下才能点选日期 -->
    <BaseDialog
      v-model="customOpen"
      title="自定义时间范围"
      width="min(420px, calc(100vw - 32px))"
      below-overlays
    >
      <div class="usage-custom-range">
        <!-- range="any"：查询历史区间必须能选过去的日期 -->
        <BaseDateTimePicker v-model="customStart" label="开始时间" :clearable="false" range="any" />
        <BaseDateTimePicker
          v-model="customEnd"
          label="结束时间"
          :disabled="customFollowNow"
          :clearable="false"
          range="any"
        />
        <BaseCheckbox v-model="customFollowNow" label="结束时间跟随当前时刻" />
        <p v-if="!customValid" class="usage-custom-range__hint">请选择开始时间，且结束时间需晚于开始时间。</p>
      </div>
      <template #footer>
        <div class="usage-custom-range__actions">
          <BaseButton variant="secondary" @click="customOpen = false">取消</BaseButton>
          <BaseButton :disabled="!customValid" @click="applyCustomRange">确定</BaseButton>
        </div>
      </template>
    </BaseDialog>

    <UsageSettingsDialog
      v-model="settingsOpen"
      :pricing="pricing"
      :loading="pricingLoading"
      :syncing="pricingSyncing"
      :sync-result="pricingSyncResult"
      :subscription-fee="subscriptionFee"
      @opened="loadPricing"
      @sync="syncPricing"
      @save="savePricing"
      @update:subscription-fee="subscriptionFee = $event"
      @save-subscription="saveSubscriptionFee"
    />
  </PageFrame>
</template>
