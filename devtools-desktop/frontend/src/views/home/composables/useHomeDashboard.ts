import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

import { useInterval } from '@/composables/use-interval'
import { usePageVisibility } from '@/composables/use-page-visibility'
import {
  HOME_REFRESH_REQUESTED_EVENT,
  type HomeRefreshRequestDetail,
} from '@/services/app-events'
import {
  getCurrentIpPurity,
  getDeploymentHistory,
  getLastDaysRange,
  getLocalDayRange,
  getLocalMonthRange,
  getRunHistory,
  getUsageSummary,
  getUsageTrends,
  type DeploymentHistoryItem,
  type IpPuritySummary,
  type RunHistoryItem,
  type UsageSummary,
  type UsageTrendPoint,
} from '@/services/modules/home-service'
import { hslToHex } from '@/services/theme-accent'

const QUOTE_INDEX_KEY = 'devtools-home-quote-index'
const SAVED_QUOTES_KEY = 'devtools-home-saved-quotes'
const LEGACY_SAVED_QUOTE_KEY = 'devtools-home-saved-quote'
const PURITY_CACHE_DURATION = 10 * 60 * 1000

export const HOME_QUOTES = [
  '把复杂留给系统，把简单留给自己。',
  '留一点空白，让真正重要的事自然浮现。',
  '把注意力放回此刻，世界会重新变得清晰。',
] as const

export interface DashboardSectionState {
  loading: boolean
  error: string
}

export interface DaylightData {
  percent: number
  sunrise: string
  noon: string
  sunset: string
  dayLength: string
  isDay: boolean
  statusLabel: string
  countdownLabel: string
  /** 白天时太阳在日轨上的位置（0~1） */
  sunT: number
  /** 夜间时月亮在夜轨上的位置（0~1，跨过整段夜晚） */
  nightT: number
}

export interface YearProgressData {
  year: number
  dayIndex: number
  totalDays: number
  percent: number
  remaining: number
  monthIndex: number
  weekNumber: number
  quarterRemaining: number
}

export interface WeeklyFootprintData {
  counts: number[]
  heights: number[]
  activeDays: number
  total: number
  peak: string
  range: string
  currentDay: number
}

export interface UsageWeekTrend {
  values: number[]
  labels: string[]
  markers: number[]
  hasData: boolean
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

function itemTimestamps(items: Array<{ startedAt?: string; timestamp?: string }>) {
  return items
    .map((item) => toTimestamp(('startedAt' in item && item.startedAt) || item.timestamp))
    .filter((value): value is number => value !== null)
}

function normalizeHeights(values: number[], minimum = 6) {
  const max = Math.max(...values, 0)
  if (!max) return values.map(() => minimum)
  return values.map((value) => value ? Math.max(minimum, Math.round(value / max * 100)) : minimum)
}

/** 今日 24 小时活动分桶（每小时一桶，对应原型的 24 根节奏柱） */
export function buildActivityBuckets(timestamps: number[], date: Date) {
  const buckets = Array.from({ length: 24 }, () => 0)
  const day = startOfDay(date).getTime()
  timestamps.forEach((timestamp) => {
    const value = new Date(timestamp)
    if (startOfDay(value).getTime() !== day) return
    buckets[Math.min(23, value.getHours())] += 1
  })
  return buckets
}

/** ISO 8601 周数（周一为一周开始） */
export function calculateWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1)
  return Math.ceil(((target.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** 农历月日（依赖 Intl 中国历，环境不支持时返回空串） */
export function formatLunarDate(date: Date) {
  try {
    const formatted = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    }).format(date)
    return formatted.replace(/(\d+)$/, (_, day: string) => {
      const value = Number(day)
      if (!Number.isFinite(value) || value < 1 || value > 30) return day
      const ones = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      if (value <= 10) return `初${ones[value]}`
      if (value < 20) return `十${ones[value - 10]}`
      if (value === 20) return '二十'
      if (value < 30) return `廿${ones[value - 20]}`
      return '三十'
    })
  } catch {
    return ''
  }
}

export function calculateYearProgress(date: Date): YearProgressData {
  const day = startOfDay(date)
  const year = day.getFullYear()
  const yearStart = new Date(year, 0, 1)
  const nextYear = new Date(year + 1, 0, 1)
  const dayIndex = Math.floor((day.getTime() - yearStart.getTime()) / 86_400_000) + 1
  const totalDays = Math.round((nextYear.getTime() - yearStart.getTime()) / 86_400_000)
  const quarterEnd = new Date(year, Math.floor(day.getMonth() / 3) * 3 + 3, 1)
  return {
    year,
    dayIndex,
    totalDays,
    percent: dayIndex / totalDays * 100,
    remaining: totalDays - dayIndex,
    monthIndex: day.getMonth(),
    weekNumber: calculateWeekNumber(day),
    quarterRemaining: Math.round((quarterEnd.getTime() - day.getTime()) / 86_400_000),
  }
}

/** 沿用武汉工作区的静态日出/日落基线；本轮不建设天文位置服务 */
const SUNRISE_MINUTES = 5 * 60 + 28
const SUNSET_MINUTES = 18 * 60 + 6

function formatMinutes(minutes: number) {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h${pad(rest)}m` : `${rest}m`
}

export function calculateDaylight(date: Date): DaylightData {
  const minutes = date.getHours() * 60 + date.getMinutes()
  const dayLength = SUNSET_MINUTES - SUNRISE_MINUTES
  const nightLength = 1440 - dayLength
  const isDay = minutes >= SUNRISE_MINUTES && minutes < SUNSET_MINUTES
  const sunT = Math.max(0, Math.min(1, (minutes - SUNRISE_MINUTES) / dayLength))
  const nightElapsed = minutes < SUNRISE_MINUTES
    ? minutes + (1440 - SUNSET_MINUTES)
    : minutes - SUNSET_MINUTES
  const countdownLabel = isDay
    ? `距日落还有 ${formatDuration(SUNSET_MINUTES - minutes)}`
    : `距日出还有 ${formatDuration(minutes < SUNRISE_MINUTES ? SUNRISE_MINUTES - minutes : 1440 - minutes + SUNRISE_MINUTES)}`
  return {
    percent: Math.round(sunT * 100),
    sunrise: formatMinutes(SUNRISE_MINUTES),
    noon: formatMinutes(Math.round((SUNRISE_MINUTES + SUNSET_MINUTES) / 2)),
    sunset: formatMinutes(SUNSET_MINUTES),
    dayLength: formatDuration(dayLength),
    isDay,
    statusLabel: isDay ? '现在 · 白天' : '现在 · 夜间',
    countdownLabel,
    sunT,
    nightT: Math.max(0, Math.min(1, nightElapsed / nightLength)),
  }
}

function mulberry32(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 按日期生成当天固定的 5 色氛围色板（0 点自动换组） */
export function generateAmbientPalette(date: Date) {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const random = mulberry32(seed)
  const baseHue = random() * 360
  const spreads = [0, 28, 56, 168, 208]
  return spreads.map((spread) => {
    const hue = (baseHue + spread + random() * 10) % 360
    const saturation = 56 + random() * 18
    const lightness = 44 + random() * 12
    return hslToHex(hue, saturation, lightness)
  })
}

export function greetingForHour(hour: number) {
  if (hour < 6) return '凌晨好'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 22) return '晚上好'
  return '夜深了'
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

function trendTokens(point: UsageTrendPoint) {
  return point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheCreationTokens
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason || '数据加载失败')
}

export function useHomeDashboard(active: Readonly<Ref<boolean>>) {
  const now = ref(new Date())
  const deploymentHistory = ref<DeploymentHistoryItem[]>([])
  const runHistory = ref<RunHistoryItem[]>([])
  const usage = ref<UsageSummary | null>(null)
  const monthUsage = ref<UsageSummary | null>(null)
  const weekTrends = ref<UsageTrendPoint[]>([])
  const purity = ref<IpPuritySummary | null>(null)
  const purityCheckedAt = ref('')
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
  const savedCount = computed(() => savedQuotes.value.length)
  const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now.value))
  const greeting = computed(() => greetingForHour(now.value.getHours()))
  const yearProgress = computed(() => calculateYearProgress(now.value))
  const daylight = computed(() => calculateDaylight(now.value))
  const ambientPalette = computed(() => generateAmbientPalette(now.value))

  const deployTimestamps = computed(() => itemTimestamps(deploymentHistory.value))
  const runTimestamps = computed(() => itemTimestamps(runHistory.value))
  const timestamps = computed(() => [...deployTimestamps.value, ...runTimestamps.value])
  const activityBuckets = computed(() => buildActivityBuckets(timestamps.value, now.value))
  const activityHeights = computed(() => normalizeHeights(activityBuckets.value))
  const activityTotal = computed(() => activityBuckets.value.reduce((sum, count) => sum + count, 0))
  const activityPeak = computed(() => {
    const max = Math.max(...activityBuckets.value, 0)
    if (!max) return '今日暂无峰值'
    const index = activityBuckets.value.indexOf(max)
    return `峰值 ${pad(index)}—${pad(index + 1)} 点`
  })
  const countToday = (values: number[]) => {
    const day = startOfDay(now.value).getTime()
    return values.filter((timestamp) => startOfDay(new Date(timestamp)).getTime() === day).length
  }
  const runCountToday = computed(() => countToday(runTimestamps.value))
  const deployCountToday = computed(() => countToday(deployTimestamps.value))

  const todayTokens = computed(() => usage.value ? formatTokens(usage.value.totalTokens) : '—')
  const todayCost = computed(() => usage.value ? `$${usage.value.costUsd.toFixed(2)}` : '—')
  const monthTokens = computed(() => monthUsage.value ? formatTokens(monthUsage.value.totalTokens) : '—')
  const monthCost = computed(() => monthUsage.value ? `$${monthUsage.value.costUsd.toFixed(2)}` : '—')
  const usageWeekTrend = computed<UsageWeekTrend>(() => {
    const tokensByDay = new Map<string, number>()
    weekTrends.value.forEach((point) => {
      const key = point.bucket.slice(0, 10)
      tokensByDay.set(key, (tokensByDay.get(key) || 0) + trendTokens(point))
    })
    const values: number[] = []
    const labels: string[] = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = startOfDay(now.value)
      day.setDate(day.getDate() - offset)
      const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
      values.push(tokensByDay.get(key) || 0)
      labels.push(offset === 0 ? '今' : '日一二三四五六'[day.getDay()])
    }
    const max = Math.max(...values)
    const markers = [6]
    const peakIndex = values.indexOf(max)
    if (max > 0 && peakIndex !== 6) markers.unshift(peakIndex)
    return { values, labels, markers, hasData: values.some(Boolean) }
  })
  const usageSplit = computed(() => {
    const summary = monthUsage.value
    if (!summary || !summary.totalTokens) return []
    const cache = summary.cacheReadTokens + summary.cacheCreationTokens
    return [
      { label: '输入', percent: summary.inputTokens / summary.totalTokens * 100 },
      { label: '输出', percent: summary.outputTokens / summary.totalTokens * 100 },
      { label: '缓存', percent: cache / summary.totalTokens * 100 },
    ].filter((segment) => segment.percent >= 0.5)
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
      total: counts.reduce((sum, count) => sum + count, 0),
      peak: max ? `周${['一', '二', '三', '四', '五', '六', '日'][counts.indexOf(max)]}` : '—',
      range: `${start.getMonth() + 1}/${start.getDate()} — ${end.getMonth() + 1}/${end.getDate()}`,
      currentDay: (now.value.getDay() + 6) % 7,
    }
  })

  async function loadDashboard() {
    const version = ++refreshVersion
    const currentRange = getLocalDayRange(now.value)
    const monthRange = getLocalMonthRange(now.value)
    const weekRange = getLastDaysRange(now.value, 7)
    activityState.value = { loading: !deploymentHistory.value.length && !runHistory.value.length, error: '' }
    usageState.value = { loading: !usage.value, error: '' }

    const [deployResult, runResult, usageResult, monthResult, trendsResult] = await Promise.allSettled([
      getDeploymentHistory(),
      getRunHistory(),
      getUsageSummary(currentRange),
      getUsageSummary(monthRange),
      getUsageTrends(weekRange, 'day'),
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
    if (monthResult.status === 'fulfilled') monthUsage.value = monthResult.value
    if (trendsResult.status === 'fulfilled') weekTrends.value = trendsResult.value
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
      purityCheckedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
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
    greeting,
    quote,
    quoteIndex,
    quoteSaved,
    savedCount,
    quoteSwitching,
    nextQuote,
    toggleQuoteSaved,
    usage,
    usageState,
    todayTokens,
    todayCost,
    monthTokens,
    monthCost,
    usageWeekTrend,
    usageSplit,
    purity,
    purityState,
    purityCheckedAt,
    activityState,
    activityTotal,
    activityPeak,
    activityHeights,
    runCountToday,
    deployCountToday,
    daylight,
    yearProgress,
    weeklyFootprint,
    ambientPalette,
    refresh,
    refreshDashboard,
    refreshPurity,
  }
}
