import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

import { useInterval } from '@/composables/use-interval'
import { usePageVisibility } from '@/composables/use-page-visibility'
import {
  HOME_REFRESH_REQUESTED_EVENT,
  type HomeRefreshRequestDetail,
} from '@/legacy/legacy-bridge'
import {
  getCurrentIpPurity,
  getDeploymentHistory,
  getLocalDayRange,
  getPreviousDayRange,
  getRunHistory,
  getUsageSummary,
  getUsageTrends,
  type DeploymentHistoryItem,
  type IpPuritySummary,
  type RunHistoryItem,
  type UsageSummary,
  type UsageTrendPoint,
} from '@/services/modules/home-service'

const QUOTE_INDEX_KEY = 'devtools-home-quote-index'
const SAVED_QUOTES_KEY = 'devtools-home-saved-quotes'
const LEGACY_SAVED_QUOTE_KEY = 'devtools-home-saved-quote'
const PURITY_CACHE_DURATION = 10 * 60 * 1000

export const HOME_QUOTES = [
  '把复杂留给系统，把简单留给自己。',
  '留一点空白，让真正重要的事自然浮现。',
  '把注意力放回此刻，世界会重新变得清晰。',
] as const

/**
 * 本轮没有建设天气 API。这个常量只用于首页的环境氛围展示，不能被解释为实时天气数据。
 */
export const HOME_WEATHER_MOCK = {
  source: 'mock-static' as const,
  city: '武汉',
  timezone: 'UTC+8',
  temperature: 31,
  feelsLike: 34,
  condition: '多云',
  humidity: 68,
  windSpeed: 2.1,
  low: 27,
  high: 34,
}

export interface DashboardSectionState {
  loading: boolean
  error: string
}

export interface MoonPhaseData {
  name: string
  age: number
  illumination: number
  position: number
  markerTop: number
  dateLabel: string
}

export interface DaylightData {
  percent: number
  sunrise: string
  sunset: string
}

export interface YearProgressData {
  year: number
  dayIndex: number
  totalDays: number
  percent: number
  remaining: number
}

export interface WeeklyFootprintData {
  counts: number[]
  heights: number[]
  activeDays: number
  average: string
  peak: string
  range: string
  currentDay: number
}

const pad = (value: number) => String(value).padStart(2, '0')

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date) {
  const value = startOfDay(date)
  const weekday = value.getDay()
  value.setDate(value.getDate() - (weekday === 0 ? 6 : weekday - 1))
  return value
}

function toTimestamp(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function activityTimestamps(history: DeploymentHistoryItem[], runHistory: RunHistoryItem[]) {
  return [
    ...history.map((item) => item.timestamp),
    ...runHistory.map((item) => item.startedAt || item.timestamp),
  ].map(toTimestamp).filter((value): value is number => value !== null)
}

function normalizeHeights(values: number[], minimum = 6) {
  const max = Math.max(...values, 0)
  if (!max) return values.map(() => minimum)
  return values.map((value) => value ? Math.max(minimum, Math.round(value / max * 100)) : minimum)
}

export function buildActivityBuckets(timestamps: number[], date: Date) {
  const buckets = Array.from({ length: 12 }, () => 0)
  const day = startOfDay(date).getTime()
  timestamps.forEach((timestamp) => {
    const value = new Date(timestamp)
    if (startOfDay(value).getTime() !== day) return
    buckets[Math.min(11, Math.floor(value.getHours() / 2))] += 1
  })
  return buckets
}

export function buildUsageTrendBuckets(points: UsageTrendPoint[]) {
  const buckets = Array.from({ length: 12 }, () => 0)
  points.forEach((point) => {
    const match = point.bucket.match(/\s(\d{2}):/)
    if (!match) return
    const hour = Number(match[1])
    if (!Number.isFinite(hour)) return
    const tokens = point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheCreationTokens
    buckets[Math.min(11, Math.floor(hour / 2))] += tokens
  })
  return buckets
}

export function calculateMoonPhase(date: Date): MoonPhaseData {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14)
  const synodicMonth = 29.53058867
  const daysSince = (date.getTime() - knownNewMoon) / 86_400_000
  const phase = (((daysSince % synodicMonth) + synodicMonth) % synodicMonth) / synodicMonth
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2
  const names = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月']
  const phaseIndex = Math.round(phase * 8) % 8
  return {
    name: names[phaseIndex],
    age: phase * synodicMonth,
    illumination: Math.round(illumination * 100),
    position: phase * 100,
    markerTop: ((30 - illumination * 26) / 34) * 100,
    dateLabel: `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
  }
}

export function calculateYearProgress(date: Date): YearProgressData {
  const day = startOfDay(date)
  const year = day.getFullYear()
  const yearStart = new Date(year, 0, 1)
  const nextYear = new Date(year + 1, 0, 1)
  const dayIndex = Math.floor((day.getTime() - yearStart.getTime()) / 86_400_000) + 1
  const totalDays = Math.round((nextYear.getTime() - yearStart.getTime()) / 86_400_000)
  return {
    year,
    dayIndex,
    totalDays,
    percent: dayIndex / totalDays * 100,
    remaining: totalDays - dayIndex,
  }
}

export function calculateDaylight(date: Date): DaylightData {
  // 与已确认原型一致，沿用武汉工作区的静态日出/日落基线；本轮不建设天文位置服务。
  const sunrise = 5 * 60 + 28
  const sunset = 18 * 60 + 6
  const minutes = date.getHours() * 60 + date.getMinutes()
  return {
    percent: Math.round(Math.max(0, Math.min(1, (minutes - sunrise) / (sunset - sunrise))) * 100),
    sunrise: '05:28',
    sunset: '18:06',
  }
}

function readSavedQuotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_QUOTES_KEY) || '[]')
    if (Array.isArray(saved)) return saved.map(String).filter((quote) => HOME_QUOTES.includes(quote as typeof HOME_QUOTES[number]))
  } catch {
    // Continue with the single-value legacy key.
  }
  const legacy = localStorage.getItem(LEGACY_SAVED_QUOTE_KEY)
  return legacy && HOME_QUOTES.includes(legacy as typeof HOME_QUOTES[number]) ? [legacy] : []
}

function formatTokens(value: number) {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`
  return value.toLocaleString('zh-CN')
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason || '数据加载失败')
}

export function useHomeDashboard(active: Readonly<Ref<boolean>>) {
  const now = ref(new Date())
  const deploymentHistory = ref<DeploymentHistoryItem[]>([])
  const runHistory = ref<RunHistoryItem[]>([])
  const usage = ref<UsageSummary | null>(null)
  const previousUsage = ref<UsageSummary | null>(null)
  const usageTrends = ref<UsageTrendPoint[]>([])
  const purity = ref<IpPuritySummary | null>(null)
  const activityState = ref<DashboardSectionState>({ loading: true, error: '' })
  const usageState = ref<DashboardSectionState>({ loading: true, error: '' })
  const purityState = ref<DashboardSectionState>({ loading: true, error: '' })
  const quoteIndex = ref(Math.max(0, Number(localStorage.getItem(QUOTE_INDEX_KEY)) || 0) % HOME_QUOTES.length)
  const savedQuotes = ref(readSavedQuotes())
  const quoteSwitching = ref(false)
  const { visible } = usePageVisibility()
  let refreshVersion = 0
  let lastPurityLoadedAt = 0
  let dashboardRefreshPromise: Promise<void> | null = null
  let purityRefreshPromise: Promise<void> | null = null
  let quoteTimer: number | null = null

  const quote = computed(() => HOME_QUOTES[quoteIndex.value])
  const quoteSaved = computed(() => savedQuotes.value.includes(quote.value))
  const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now.value))
  const clockLabel = computed(() => now.value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }))
  const yearProgress = computed(() => calculateYearProgress(now.value))
  const daylight = computed(() => calculateDaylight(now.value))
  const moon = computed(() => calculateMoonPhase(now.value))
  const timestamps = computed(() => activityTimestamps(deploymentHistory.value, runHistory.value))
  const activityBuckets = computed(() => buildActivityBuckets(timestamps.value, now.value))
  const activityHeights = computed(() => normalizeHeights(activityBuckets.value))
  const activityTotal = computed(() => activityBuckets.value.reduce((sum, count) => sum + count, 0))
  const activityPeak = computed(() => {
    const max = Math.max(...activityBuckets.value, 0)
    if (!max) return '今日暂无峰值'
    const index = activityBuckets.value.indexOf(max)
    return `峰值 ${pad(index * 2)}:00—${pad(index * 2 + 2)}:00`
  })
  const usageBuckets = computed(() => buildUsageTrendBuckets(usageTrends.value))
  const usageHeights = computed(() => normalizeHeights(usageBuckets.value, 4))
  const usageHasTrend = computed(() => usageBuckets.value.some(Boolean))
  const usageTokens = computed(() => usage.value ? formatTokens(usage.value.totalTokens) : '—')
  const usageCost = computed(() => usage.value ? `$${usage.value.costUsd.toFixed(2)}` : '—')
  const usageCacheRate = computed(() => usage.value ? `${(usage.value.cacheHitRate * 100).toFixed(1)}%` : '—')
  const usageRequests = computed(() => usage.value ? usage.value.requests.toLocaleString('zh-CN') : '—')
  const usageDelta = computed(() => {
    const current = usage.value?.totalTokens || 0
    const previous = previousUsage.value?.totalTokens || 0
    if (!previous) return current ? '今日实时' : '今日暂无用量'
    const delta = (current - previous) / previous * 100
    return `较昨日 ${delta >= 0 ? '↑' : '↓'}${Math.abs(delta).toFixed(1)}% · 今日实时`
  })
  const weeklyFootprint = computed<WeeklyFootprintData>(() => {
    const start = startOfWeek(now.value)
    const counts = Array.from({ length: 7 }, () => 0)
    timestamps.value.forEach((timestamp) => {
      const index = Math.floor((startOfDay(new Date(timestamp)).getTime() - start.getTime()) / 86_400_000)
      if (index >= 0 && index < 7) counts[index] += 1
    })
    const activeDays = counts.filter(Boolean).length
    const max = Math.max(...counts, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return {
      counts,
      heights: normalizeHeights(counts, 8),
      activeDays,
      average: counts.reduce((sum, count) => sum + count, 0) ? (counts.reduce((sum, count) => sum + count, 0) / Math.max(activeDays, 1)).toFixed(1) : '0.0',
      peak: max ? `周${['一', '二', '三', '四', '五', '六', '日'][counts.indexOf(max)]}` : '—',
      range: `${start.getMonth() + 1} / ${start.getDate()} — ${end.getMonth() + 1} / ${end.getDate()}`,
      currentDay: (now.value.getDay() + 6) % 7,
    }
  })
  const ambientMessage = computed(() => {
    const hour = now.value.getHours()
    if (activityTotal.value >= 40) return '专注，且富有能量。'
    if (hour < 8 || hour >= 20) return '安静，适合慢下来。'
    return '冷静，但不失明亮。'
  })
  const ambientWave = computed(() => {
    const base = activityHeights.value.slice(2, 10)
    return base.length === 8 ? base : [30, 62, 88, 48, 76, 38, 91, 56]
  })

  async function loadDashboard() {
    const version = ++refreshVersion
    const currentRange = getLocalDayRange(now.value)
    const previousRange = getPreviousDayRange(now.value)
    activityState.value = { loading: !deploymentHistory.value.length && !runHistory.value.length, error: '' }
    usageState.value = { loading: !usage.value, error: '' }

    const [deployResult, runResult, usageResult, previousResult, trendsResult] = await Promise.allSettled([
      getDeploymentHistory(),
      getRunHistory(),
      getUsageSummary(currentRange),
      getUsageSummary(previousRange),
      getUsageTrends(currentRange),
    ])
    if (version !== refreshVersion) return

    const activityErrors: string[] = []
    if (deployResult.status === 'fulfilled') deploymentHistory.value = deployResult.value
    else activityErrors.push(errorMessage(deployResult.reason))
    if (runResult.status === 'fulfilled') runHistory.value = runResult.value
    else activityErrors.push(errorMessage(runResult.reason))
    activityState.value = { loading: false, error: activityErrors.length === 2 ? activityErrors[0] : '' }

    const usageErrors: string[] = []
    if (usageResult.status === 'fulfilled') usage.value = usageResult.value
    else usageErrors.push(errorMessage(usageResult.reason))
    if (previousResult.status === 'fulfilled') previousUsage.value = previousResult.value
    if (trendsResult.status === 'fulfilled') usageTrends.value = trendsResult.value
    else usageErrors.push(errorMessage(trendsResult.reason))
    usageState.value = { loading: false, error: usageErrors.length === 2 ? usageErrors[0] : '' }
  }

  function refreshDashboard() {
    if (dashboardRefreshPromise) return dashboardRefreshPromise
    dashboardRefreshPromise = loadDashboard().finally(() => {
      dashboardRefreshPromise = null
    })
    return dashboardRefreshPromise
  }

  async function loadPurity(force = false) {
    if (!force && purity.value && Date.now() - lastPurityLoadedAt < PURITY_CACHE_DURATION) return
    purityState.value = { loading: !purity.value, error: '' }
    try {
      purity.value = await getCurrentIpPurity()
      lastPurityLoadedAt = Date.now()
      purityState.value = { loading: false, error: '' }
    } catch (reason) {
      purityState.value = { loading: false, error: errorMessage(reason) }
    }
  }

  function refreshPurity(force = false) {
    if (purityRefreshPromise) return purityRefreshPromise
    purityRefreshPromise = loadPurity(force).finally(() => {
      purityRefreshPromise = null
    })
    return purityRefreshPromise
  }

  async function refresh(options: { includePurity?: boolean; forcePurity?: boolean } = {}) {
    now.value = new Date()
    const tasks: Promise<unknown>[] = [refreshDashboard()]
    if (options.includePurity) tasks.push(refreshPurity(options.forcePurity))
    await Promise.all(tasks)
  }

  function nextQuote() {
    if (quoteSwitching.value) return
    quoteSwitching.value = true
    quoteTimer = window.setTimeout(() => {
      quoteIndex.value = (quoteIndex.value + 1) % HOME_QUOTES.length
      localStorage.setItem(QUOTE_INDEX_KEY, String(quoteIndex.value))
      quoteSwitching.value = false
      quoteTimer = null
    }, 170)
  }

  function toggleQuoteSaved() {
    savedQuotes.value = quoteSaved.value
      ? savedQuotes.value.filter((saved) => saved !== quote.value)
      : [...savedQuotes.value, quote.value]
    localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(savedQuotes.value))
    localStorage.removeItem(LEGACY_SAVED_QUOTE_KEY)
  }

  function handleRefreshRequest(event: Event) {
    const detail = (event as CustomEvent<HomeRefreshRequestDetail>).detail
    if (!active.value) return
    void refresh({ includePurity: detail?.reason === 'activation' })
  }

  useInterval(() => {
    now.value = new Date()
  }, 30_000)
  useInterval(() => {
    if (active.value && visible.value) void refreshDashboard()
  }, 60_000)

  watch(active, (isActive, wasActive) => {
    if (isActive && !wasActive) void refresh({ includePurity: true })
  })

  onMounted(() => {
    window.addEventListener(HOME_REFRESH_REQUESTED_EVENT, handleRefreshRequest)
    void refresh({ includePurity: true })
  })

  onBeforeUnmount(() => {
    refreshVersion += 1
    if (quoteTimer) window.clearTimeout(quoteTimer)
    window.removeEventListener(HOME_REFRESH_REQUESTED_EVENT, handleRefreshRequest)
  })

  return {
    active,
    now,
    dateLabel,
    clockLabel,
    weather: HOME_WEATHER_MOCK,
    quote,
    quoteIndex,
    quoteSaved,
    quoteSwitching,
    nextQuote,
    toggleQuoteSaved,
    usage,
    usageState,
    usageTokens,
    usageCost,
    usageCacheRate,
    usageRequests,
    usageDelta,
    usageHeights,
    usageHasTrend,
    purity,
    purityState,
    activityState,
    activityTotal,
    activityPeak,
    activityHeights,
    daylight,
    yearProgress,
    weeklyFootprint,
    ambientMessage,
    ambientWave,
    moon,
    refresh,
    refreshDashboard,
    refreshPurity,
  }
}
