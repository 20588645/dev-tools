import { apiClient } from '@/services/api-client'

export interface DeploymentHistoryItem {
  id?: string
  projectName?: string
  status?: string
  timestamp?: string
}

export interface RunHistoryItem {
  id?: string
  projectName?: string
  status?: string
  startedAt?: string
  timestamp?: string
}

export interface UsageSummary {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
  totalTokens: number
  cacheHitRate: number
  costUsd: number
  cacheSavedUsd: number
}

export interface UsageTrendPoint {
  bucket: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costMicroUsd: number
}

export interface IpPuritySummary {
  ip: string
  location: string
  riskScore: number
  riskLabel: string
  ipType: string
  nativeIp: string
}

export interface TimeRange {
  start: number
  end: number
}

interface IpPurityResponse {
  ip?: unknown
  location?: unknown
  risk_score?: unknown
  risk_label?: unknown
  ip_type?: unknown
  native_ip?: unknown
}

const numberValue = (value: unknown) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

function normalizeUsageSummary(value: Partial<UsageSummary> | null | undefined): UsageSummary {
  return {
    requests: numberValue(value?.requests),
    inputTokens: numberValue(value?.inputTokens),
    outputTokens: numberValue(value?.outputTokens),
    cacheReadTokens: numberValue(value?.cacheReadTokens),
    cacheCreationTokens: numberValue(value?.cacheCreationTokens),
    costMicroUsd: numberValue(value?.costMicroUsd),
    totalTokens: numberValue(value?.totalTokens),
    cacheHitRate: numberValue(value?.cacheHitRate),
    costUsd: numberValue(value?.costUsd),
    cacheSavedUsd: numberValue(value?.cacheSavedUsd),
  }
}

function normalizeUsageTrend(value: Partial<UsageTrendPoint>): UsageTrendPoint {
  return {
    bucket: String(value.bucket || ''),
    requests: numberValue(value.requests),
    inputTokens: numberValue(value.inputTokens),
    outputTokens: numberValue(value.outputTokens),
    cacheReadTokens: numberValue(value.cacheReadTokens),
    cacheCreationTokens: numberValue(value.cacheCreationTokens),
    costMicroUsd: numberValue(value.costMicroUsd),
  }
}

function query(range: TimeRange, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    start: String(range.start),
    end: String(range.end),
    ...extra,
  }).toString()
}

export function getLocalDayRange(date: Date): TimeRange {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return {
    start: Math.floor(start / 1000),
    end: Math.floor((start + 86_400_000) / 1000),
  }
}

export function getPreviousDayRange(date: Date): TimeRange {
  const current = getLocalDayRange(date)
  return { start: current.start - 86_400, end: current.start }
}

export async function getDeploymentHistory() {
  const value = await apiClient.get<DeploymentHistoryItem[]>('/api/history')
  return Array.isArray(value) ? value : []
}

export async function getRunHistory() {
  const value = await apiClient.get<RunHistoryItem[]>('/api/run/history')
  return Array.isArray(value) ? value : []
}

export async function getUsageSummary(range: TimeRange) {
  const value = await apiClient.get<Partial<UsageSummary>>(`/api/usage/summary?${query(range)}`)
  return normalizeUsageSummary(value)
}

export async function getUsageTrends(range: TimeRange) {
  const value = await apiClient.get<Partial<UsageTrendPoint>[]>(`/api/usage/trends?${query(range, { bucket: 'min10' })}`)
  return Array.isArray(value) ? value.map(normalizeUsageTrend) : []
}

export async function getCurrentIpPurity() {
  const value = await apiClient.get<IpPurityResponse>('/api/ipcheck/lookup', 20_000)
  const riskScore = numberValue(String(value?.risk_score || '').replace('%', ''))
  return {
    ip: String(value?.ip || ''),
    location: String(value?.location || ''),
    riskScore: Math.max(0, Math.min(100, riskScore)),
    riskLabel: String(value?.risk_label || ''),
    ipType: String(value?.ip_type || ''),
    nativeIp: String(value?.native_ip || ''),
  } satisfies IpPuritySummary
}
