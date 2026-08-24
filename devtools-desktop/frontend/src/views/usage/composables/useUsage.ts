import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue'

import { useInterval } from '@/composables/use-interval'
import * as usageService from '@/services/modules/usage-service'
import type {
  UsageApp,
  UsageBucket,
  UsageLogRecord,
  UsageLogsPage,
  UsageModelStat,
  UsagePricingRow,
  UsagePricingSyncResult,
  UsageProjectStat,
  UsageQuery,
  UsageRate,
  UsageSummary,
  UsageTrendRow,
} from '@/services/modules/usage-service'
import { useNotificationStore } from '@/stores/notification'

import { usageProjectTokens } from '../usage-format'

export type UsageRange = 'today' | '7d' | 'month' | 'all' | 'custom'
export type UsageExplorerTab = 'models' | 'logs' | 'pricing'

/** 自定义区间（unix 秒）；end 为空表示「跟随当前时刻」 */
export interface UsageCustomRange {
  start: number
  end: number
}

export const USAGE_REFRESH_OPTIONS = [
  { label: '关闭', value: '0' },
  { label: '10s', value: '10' },
  { label: '30s', value: '30' },
  { label: '60s', value: '60' },
]

interface UseUsageOptions {
  service?: typeof usageService
  storage?: Storage
  now?: () => Date
}

const emptySummary = (): UsageSummary => ({
  requests: 0,
  pricedRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  pricedTokens: 0,
  totalTokens: 0,
  cacheHitRate: 0,
  pricingCoverage: 0,
  costMicroUsd: 0,
  costUsd: 0,
  cacheSavedUsd: 0,
})

const emptyLogs = (): UsageLogsPage => ({ total: 0, page: 1, pageSize: 15, rows: [] })
const SUBSCRIPTION_FEE_KEY = 'devtools-usage-subfee'
const REFRESH_INTERVAL_KEY = 'devtools-usage-refresh'
const DEFAULT_REFRESH_SECONDS = 30

const ALLOWED_REFRESH_SECONDS = USAGE_REFRESH_OPTIONS.map((option) => Number(option.value))

export function readUsageRefreshSeconds(storage?: Storage): number {
  // 必须先判空：Number(null) === 0 而 0 是合法的「关闭」档，
  // 否则从未设置过的用户会被当成主动关闭了自动刷新
  const raw = storage?.getItem(REFRESH_INTERVAL_KEY)
  if (raw === null || raw === undefined || raw === '') return DEFAULT_REFRESH_SECONDS
  const stored = Number(raw)
  return ALLOWED_REFRESH_SECONDS.includes(stored) ? stored : DEFAULT_REFRESH_SECONDS
}

/** 跨度越大粒度越粗，避免长区间返回上万个点 */
export function usageBucketForSpan(spanSeconds: number): UsageBucket {
  if (spanSeconds <= 2 * 86_400) return 'min10'
  if (spanSeconds <= 40 * 86_400) return 'hour'
  return 'day'
}

export function usageRangeQuery(
  range: UsageRange,
  now = new Date(),
  custom?: UsageCustomRange | null,
): { query: UsageQuery; bucket: UsageBucket } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'custom') {
    if (!custom) return { query: {}, bucket: 'day' }
    const end = custom.end || Math.floor(now.getTime() / 1000)
    return { query: { start: custom.start, end }, bucket: usageBucketForSpan(Math.max(1, end - custom.start)) }
  }
  if (range === 'today') {
    return {
      query: {
        start: Math.floor(today.getTime() / 1000),
        end: Math.floor((today.getTime() + 86_400_000) / 1000),
      },
      bucket: 'min10',
    }
  }
  if (range === '7d') {
    return {
      query: { start: Math.floor((today.getTime() - 6 * 86_400_000) / 1000) },
      bucket: 'hour',
    }
  }
  if (range === 'month') {
    return {
      query: { start: Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000) },
      bucket: 'hour',
    }
  }
  return { query: {}, bucket: 'day' }
}

export function previousUsageQuery(
  range: UsageRange,
  now = new Date(),
  custom?: UsageCustomRange | null,
): UsageQuery | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todaySeconds = Math.floor(today.getTime() / 1000)
  if (range === 'today') return { start: todaySeconds - 86_400, end: todaySeconds }
  if (range === '7d') {
    const start = todaySeconds - 6 * 86_400
    return { start: start - 7 * 86_400, end: start }
  }
  if (range === 'month') {
    return {
      start: Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000),
      end: Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000),
    }
  }
  // 自定义区间用「等长的前一段」做环比：7/01~7/10 对比 6/21~6/30
  if (range === 'custom') {
    if (!custom) return null
    const end = custom.end || Math.floor(now.getTime() / 1000)
    const span = end - custom.start
    if (span <= 0) return null
    return { start: custom.start - span, end: custom.start }
  }
  return null
}

export function useUsage(options: UseUsageOptions = {}) {
  const service = options.service ?? usageService
  const storage = options.storage ?? globalThis.localStorage
  const now = options.now ?? (() => new Date())
  const notifications = useNotificationStore()

  const range = ref<UsageRange>('month')
  const customRange = ref<UsageCustomRange | null>(null)
  const refreshSeconds = ref(readUsageRefreshSeconds(storage))
  const app = ref<UsageApp>('')
  const explorerTab = ref<UsageExplorerTab>('models')
  const summary = ref<UsageSummary>(emptySummary())
  const previousSummary = ref<UsageSummary | null>(null)
  const models = ref<UsageModelStat[]>([])
  const projects = ref<UsageProjectStat[]>([])
  const topRequests = ref<UsageLogRecord[]>([])
  const claudeTrends = ref<UsageTrendRow[]>([])
  const codexTrends = ref<UsageTrendRow[]>([])
  const cursorTrends = ref<UsageTrendRow[]>([])
  const logs = ref<UsageLogsPage>(emptyLogs())
  const logModel = ref('')
  const pricing = ref<UsagePricingRow[]>([])
  const pricingSyncResult = ref<UsagePricingSyncResult | null>(null)
  const rate = ref<UsageRate | null>(null)
  const subscriptionFee = ref(String(Number(storage?.getItem(SUBSCRIPTION_FEE_KEY)) || ''))
  const loading = ref(false)
  const error = ref('')
  const refreshing = ref(false)
  const scanning = ref(false)
  const cursorSyncing = ref(false)
  const importing = ref(false)
  const pricingLoading = ref(false)
  const pricingSyncing = ref(false)
  const lastUpdatedAt = ref(0)

  let mounted = false
  let loadVersion = 0
  let loadController: AbortController | null = null

  const rangeInfo = computed(() => usageRangeQuery(range.value, now(), customRange.value))
  const query = computed<UsageQuery>(() => ({ ...rangeInfo.value.query, app: app.value }))
  const sortedProjects = computed(() => [...projects.value].sort((a, b) => usageProjectTokens(b) - usageProjectTokens(a)))
  const priced = computed(() => summary.value.pricingCoverage > 0)
  const status = computed(() => {
    if (loading.value || refreshing.value || scanning.value || cursorSyncing.value) {
      return { label: cursorSyncing.value ? '正在同步 Cursor' : '正在同步', status: 'checking' as const }
    }
    if (error.value) return { label: '数据异常', status: 'offline' as const }
    if (!lastUpdatedAt.value) return { label: '等待同步', status: 'idle' as const }
    return {
      label: `已同步 ${new Date(lastUpdatedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'online' as const,
    }
  })
  const modelOptions = computed(() => [
    { label: '全部模型', value: '' },
    ...Array.from(new Map(models.value.map((model) => [model.model, model.displayName || model.model])).entries())
      .map(([value, label]) => ({ label, value })),
  ])

  const refreshTimer = useInterval(
    () => refresh(true),
    () => refreshSeconds.value > 0 ? refreshSeconds.value * 1000 : null,
    { autoStart: false },
  )

  function stopTimer() {
    refreshTimer.clear()
  }

  function startTimer() {
    // 0 = 关闭自动刷新（每次刷新都会触发 Sidecar 重扫日志，间隔不宜过密）
    refreshTimer.start()
  }

  function setRefreshSeconds(seconds: number) {
    const next = ALLOWED_REFRESH_SECONDS.includes(seconds) ? seconds : DEFAULT_REFRESH_SECONDS
    refreshSeconds.value = next
    storage?.setItem(REFRESH_INTERVAL_KEY, String(next))
    if (mounted) startTimer()
  }

  /** 传入 null 表示取消自定义区间并回到「本月」 */
  function setCustomRange(next: UsageCustomRange | null) {
    if (!next) {
      customRange.value = null
      range.value = 'month'
      return
    }
    customRange.value = next
    if (range.value === 'custom') {
      // range 没变，watch 不会触发，这里手动重载
      logs.value.page = 1
      logModel.value = ''
      if (mounted) void refresh()
    } else {
      range.value = 'custom'
    }
  }

  async function refresh(silent = false) {
    const version = ++loadVersion
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    if (silent) refreshing.value = true
    else loading.value = true
    error.value = ''
    try {
      const apps: Array<Exclude<UsageApp, ''>> = app.value ? [app.value as Exclude<UsageApp, ''>] : ['claude', 'codex', 'cursor']
      const previous = previousUsageQuery(range.value, now(), customRange.value)
      if (previous) previous.app = app.value
      const results = await Promise.all([
        service.getUsageSummary(query.value, controller.signal),
        service.getUsageModels(query.value, controller.signal),
        service.getUsageProjects(query.value, controller.signal),
        service.getUsageRate(controller.signal).catch(() => null),
        previous ? service.getUsageSummary(previous, controller.signal).catch(() => null) : Promise.resolve(null),
        ...apps.map((name) => service.getUsageTrends(query.value, rangeInfo.value.bucket, name, controller.signal)),
      ])
      if (version !== loadVersion) return
      const [nextSummary, nextModels, nextProjects, nextRate, nextPrevious] = results
      const trendRows = results.slice(5) as UsageTrendRow[][]
      summary.value = nextSummary as UsageSummary
      models.value = nextModels as UsageModelStat[]
      projects.value = nextProjects as UsageProjectStat[]
      rate.value = nextRate as UsageRate | null
      previousSummary.value = nextPrevious as UsageSummary | null
      claudeTrends.value = apps.includes('claude') ? trendRows[apps.indexOf('claude')] ?? [] : []
      codexTrends.value = apps.includes('codex') ? trendRows[apps.indexOf('codex')] ?? [] : []
      cursorTrends.value = apps.includes('cursor') ? trendRows[apps.indexOf('cursor')] ?? [] : []
      const [nextTop, nextLogs] = await Promise.all([
        service.getUsageTop(query.value, nextSummary.pricingCoverage > 0 ? 'cost' : 'tokens', controller.signal),
        service.getUsageLogs(query.value, logs.value.page, logs.value.pageSize, logModel.value, controller.signal),
      ])
      if (version !== loadVersion) return
      topRequests.value = nextTop
      logs.value = nextLogs
      lastUpdatedAt.value = Date.now()
    } catch (reason) {
      if (controller.signal.aborted) return
      error.value = reason instanceof Error ? reason.message : '用量数据加载失败'
      if (silent) notifications.push(error.value, 'error')
    } finally {
      if (version === loadVersion) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  async function loadPricing() {
    pricingLoading.value = true
    try {
      pricing.value = await service.getUsagePricing()
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '价格设置加载失败', 'error')
    } finally {
      pricingLoading.value = false
    }
  }

  async function syncPricing() {
    pricingSyncing.value = true
    try {
      pricingSyncResult.value = await service.syncUsagePricing()
      const result = pricingSyncResult.value
      notifications.push(
        `价格同步完成：覆盖 ${result.applied}，未匹配 ${result.unmatched}，重算 ${result.repriced} 条`,
        result.unmatched ? 'warning' : 'success',
      )
      await Promise.all([loadPricing(), refresh(true)])
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '价格同步失败', 'error')
    } finally {
      pricingSyncing.value = false
    }
  }

  async function savePricing(row: UsagePricingRow) {
    const values = [row.inputPerM, row.outputPerM, row.cacheReadPerM, row.cacheCreationPerM]
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      notifications.push('模型单价必须是大于或等于 0 的有效数字', 'warning')
      return
    }
    try {
      await service.saveUsagePricing(row.modelId, {
        displayName: row.displayName,
        inputPerM: row.inputPerM,
        outputPerM: row.outputPerM,
        cacheReadPerM: row.cacheReadPerM,
        cacheCreationPerM: row.cacheCreationPerM,
      })
      notifications.push(`${row.modelId} 单价已保存`, 'success')
      await Promise.all([loadPricing(), refresh(true)])
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '单价保存失败', 'error')
    }
  }

  async function forceScan() {
    scanning.value = true
    try {
      const result = await service.forceUsageScan()
      notifications.push(`已扫描 ${result.files} 个日志文件，更新 ${result.upserted} 条记录`, 'success')
      await refresh(true)
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '扫描日志失败', 'error')
    } finally {
      scanning.value = false
    }
  }

  async function syncCursor() {
    cursorSyncing.value = true
    try {
      const result = await service.syncCursorUsage()
      if (result.cursorError) {
        notifications.push(`Cursor 同步失败：${result.cursorError}`, 'error')
        return
      }
      notifications.push(`已同步 Cursor 官方用量 ${result.upserted} 条`, 'success')
      await refresh(true)
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : 'Cursor 同步失败', 'error')
    } finally {
      cursorSyncing.value = false
    }
  }

  async function importHistory() {
    importing.value = true
    try {
      const result = await service.importCcSwitchUsage()
      notifications.push(`历史导入完成：新增 ${result.imported} 条，并入价格 ${result.pricingImported} 条`, 'success')
      await refresh(true)
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : 'CC Switch 历史导入失败', 'error')
    } finally {
      importing.value = false
    }
  }

  function saveSubscriptionFee() {
    const fee = Number(subscriptionFee.value)
    if (subscriptionFee.value && (!(fee > 0) || !Number.isFinite(fee))) {
      notifications.push('订阅费用需要填写大于 0 的数字', 'warning')
      return
    }
    if (subscriptionFee.value) storage?.setItem(SUBSCRIPTION_FEE_KEY, String(fee))
    else storage?.removeItem(SUBSCRIPTION_FEE_KEY)
    notifications.push('订阅费用已保存', 'success')
  }

  function setLogPage(page: number) {
    logs.value.page = Math.max(1, page)
    void refresh(true)
  }

  function setLogModel(model: string) {
    logModel.value = model
    logs.value.page = 1
    void refresh(true)
  }

  watch([range, app], () => {
    logs.value.page = 1
    logModel.value = ''
    if (mounted) void refresh()
  })

  onMounted(() => {
    mounted = true
    void refresh()
    startTimer()
  })
  onActivated(() => {
    if (mounted) startTimer()
  })
  onDeactivated(stopTimer)
  onBeforeUnmount(() => {
    mounted = false
    stopTimer()
    loadController?.abort()
  })

  return {
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
    cursorTrends,
    logs,
    logModel,
    modelOptions,
    pricing,
    pricingSyncResult,
    rate,
    subscriptionFee,
    loading,
    error,
    refreshing,
    scanning,
    cursorSyncing,
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
    syncCursor,
    importHistory,
    saveSubscriptionFee,
    setLogPage,
    setLogModel,
  }
}
