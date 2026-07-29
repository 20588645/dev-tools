import { apiClient } from '@/services/api-client'

const USAGE_TIMEOUT = 30_000

export type UsageApp = '' | 'claude' | 'codex'
export type UsageBucket = 'min10' | 'hour' | 'day'

export interface UsageQuery {
  start?: number
  end?: number
  app?: UsageApp
}

export interface UsageSummary {
  requests: number
  pricedRequests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  pricedTokens: number
  totalTokens: number
  cacheHitRate: number
  pricingCoverage: number
  costMicroUsd: number
  costUsd: number
  cacheSavedUsd: number
}

export interface UsageTrendRow {
  bucket: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
}

export interface UsageModelStat {
  model: string
  appType: string
  pricingModel: string
  displayName: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
}

export interface UsageProjectStat {
  project: string
  apps: string[]
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
}

export interface UsageLogRecord {
  requestId: string
  sessionId: string
  projectDir: string
  appType: string
  model: string
  pricingModel: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
  createdAt: number
}

export interface UsageLogsPage {
  total: number
  page: number
  pageSize: number
  rows: UsageLogRecord[]
}

export interface UsagePricingRow {
  modelId: string
  displayName: string
  inputPerM: number
  outputPerM: number
  cacheReadPerM: number
  cacheCreationPerM: number
  source: string
  sourceUrl: string
  provider: string
  confidence: string
  fetchedAt: number
}

export interface UsagePriceSource {
  source: string
  url: string
  ok: boolean
  count: number
  error: string
}

export interface UsagePricingSyncResult {
  fetchedAt: number
  sources: UsagePriceSource[]
  total: number
  applied: number
  unchanged: number
  unmatched: number
  conflicts: number
  repriced: number
}

export interface UsageScanResult {
  files: number
  upserted: number
}

export interface UsageImportResult {
  scanned: number
  imported: number
  pricingImported: number
}

export interface UsageRate {
  rate: number
  source: string
  fetchedAt: number
}

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '')
const number = (value: unknown) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export function buildUsageQuery(query: UsageQuery = {}, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams()
  if (query.start) params.set('start', String(query.start))
  if (query.end) params.set('end', String(query.end))
  if (query.app) params.set('app', query.app)
  Object.entries(extra).forEach(([key, value]) => params.set(key, String(value)))
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export function normalizeUsageSummary(value: unknown): UsageSummary {
  const row = record(value)
  return {
    requests: number(row.requests),
    pricedRequests: number(row.pricedRequests),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheCreationTokens: number(row.cacheCreationTokens),
    pricedTokens: number(row.pricedTokens),
    totalTokens: number(row.totalTokens),
    cacheHitRate: number(row.cacheHitRate),
    pricingCoverage: Math.max(0, Math.min(1, number(row.pricingCoverage))),
    costMicroUsd: number(row.costMicroUsd),
    costUsd: number(row.costUsd),
    cacheSavedUsd: number(row.cacheSavedUsd),
  }
}

export function normalizeUsageLog(value: unknown): UsageLogRecord {
  const row = record(value)
  return {
    requestId: text(row.requestId),
    sessionId: text(row.sessionId),
    projectDir: text(row.projectDir),
    appType: text(row.appType),
    model: text(row.model),
    pricingModel: text(row.pricingModel),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheCreationTokens: number(row.cacheCreationTokens),
    costMicroUsd: number(row.costMicroUsd),
    createdAt: number(row.createdAt),
  }
}

const normalizeTrend = (value: unknown): UsageTrendRow => {
  const row = record(value)
  return {
    bucket: text(row.bucket),
    requests: number(row.requests),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheCreationTokens: number(row.cacheCreationTokens),
    costMicroUsd: number(row.costMicroUsd),
  }
}

const normalizeModel = (value: unknown): UsageModelStat => {
  const row = record(value)
  return {
    model: text(row.model),
    appType: text(row.appType),
    pricingModel: text(row.pricingModel),
    displayName: text(row.displayName) || text(row.model),
    requests: number(row.requests),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheCreationTokens: number(row.cacheCreationTokens),
    costMicroUsd: number(row.costMicroUsd),
  }
}

const normalizeProject = (value: unknown): UsageProjectStat => {
  const row = record(value)
  return {
    project: text(row.project),
    apps: Array.isArray(row.apps) ? row.apps.map(text) : [],
    requests: number(row.requests),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheCreationTokens: number(row.cacheCreationTokens),
    costMicroUsd: number(row.costMicroUsd),
  }
}

const normalizePricing = (value: unknown): UsagePricingRow => {
  const row = record(value)
  return {
    modelId: text(row.modelId),
    displayName: text(row.displayName),
    inputPerM: number(row.inputPerM),
    outputPerM: number(row.outputPerM),
    cacheReadPerM: number(row.cacheReadPerM),
    cacheCreationPerM: number(row.cacheCreationPerM),
    source: text(row.source),
    sourceUrl: text(row.sourceUrl),
    provider: text(row.provider),
    confidence: text(row.confidence),
    fetchedAt: number(row.fetchedAt),
  }
}

export async function getUsageSummary(query: UsageQuery, signal?: AbortSignal) {
  const value = await apiClient.request('/api/usage/summary' + buildUsageQuery(query), { signal, timeout: USAGE_TIMEOUT })
  return normalizeUsageSummary(value)
}

export async function getUsageTrends(query: UsageQuery, bucket: UsageBucket, app: Exclude<UsageApp, ''>, signal?: AbortSignal) {
  const value = await apiClient.request<unknown[]>('/api/usage/trends' + buildUsageQuery(query, { bucket, app }), { signal, timeout: USAGE_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeTrend) : []
}

export async function getUsageModels(query: UsageQuery, signal?: AbortSignal) {
  const value = await apiClient.request<unknown[]>('/api/usage/models' + buildUsageQuery(query), { signal, timeout: USAGE_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeModel) : []
}

export async function getUsageProjects(query: UsageQuery, signal?: AbortSignal) {
  const value = await apiClient.request<unknown[]>('/api/usage/projects' + buildUsageQuery(query), { signal, timeout: USAGE_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeProject) : []
}

export async function getUsageTop(query: UsageQuery, sort: 'cost' | 'tokens', signal?: AbortSignal) {
  const value = await apiClient.request<unknown[]>('/api/usage/top' + buildUsageQuery(query, { limit: 10, sort }), { signal, timeout: USAGE_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeUsageLog) : []
}

export async function getUsageLogs(query: UsageQuery, page: number, pageSize: number, model: string, signal?: AbortSignal) {
  const extra: Record<string, string | number> = { page, pageSize }
  if (model) extra.model = model
  const value = record(await apiClient.request('/api/usage/logs' + buildUsageQuery(query, extra), { signal, timeout: USAGE_TIMEOUT }))
  return {
    total: number(value.total),
    page: number(value.page) || page,
    pageSize: number(value.pageSize) || pageSize,
    rows: Array.isArray(value.rows) ? value.rows.map(normalizeUsageLog) : [],
  }
}

export async function getUsagePricing(signal?: AbortSignal) {
  const value = await apiClient.request<unknown[]>('/api/usage/pricing', { signal, timeout: USAGE_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizePricing) : []
}

export async function syncUsagePricing(): Promise<UsagePricingSyncResult> {
  const value = record(await apiClient.post('/api/usage/pricing/sync', {}, 60_000))
  return {
    fetchedAt: number(value.fetchedAt),
    sources: Array.isArray(value.sources) ? value.sources.map((item) => {
      const source = record(item)
      return {
        source: text(source.source),
        url: text(source.url),
        ok: Boolean(source.ok),
        count: number(source.count),
        error: text(source.error),
      }
    }) : [],
    total: number(value.total),
    applied: number(value.applied),
    unchanged: number(value.unchanged),
    unmatched: number(value.unmatched),
    conflicts: number(value.conflicts),
    repriced: number(value.repriced),
  }
}

export async function saveUsagePricing(modelId: string, input: Omit<UsagePricingRow, 'modelId' | 'source' | 'sourceUrl' | 'provider' | 'confidence' | 'fetchedAt'>) {
  await apiClient.put(`/api/usage/pricing/${encodeURIComponent(modelId)}`, input, USAGE_TIMEOUT)
}

export async function forceUsageScan(): Promise<UsageScanResult> {
  const value = record(await apiClient.post('/api/usage/sync', {}, 60_000))
  return { files: number(value.files), upserted: number(value.upserted) }
}

export async function importCcSwitchUsage(): Promise<UsageImportResult> {
  const value = record(await apiClient.post('/api/usage/import-ccswitch', {}, 60_000))
  return {
    scanned: number(value.scanned),
    imported: number(value.imported),
    pricingImported: number(value.pricingImported),
  }
}

export async function getUsageRate(signal?: AbortSignal): Promise<UsageRate> {
  const value = record(await apiClient.request('/api/usage/rate', { signal, timeout: USAGE_TIMEOUT }))
  return { rate: number(value.rate), source: text(value.source), fetchedAt: number(value.fetchedAt) }
}
