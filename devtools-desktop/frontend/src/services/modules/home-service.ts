import { apiClient } from '@/services/api-client'
import {
  getCurrentIpPuritySummary,
  type IpPuritySummary,
} from '@/services/modules/ipcheck-service'

export type { IpPuritySummary } from '@/services/modules/ipcheck-service'

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

export interface TimeRange {
  start: number
  end: number
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

/** 含今天在内的最近 N 个自然日 */
export function getLastDaysRange(date: Date, days: number): TimeRange {
  const today = getLocalDayRange(date)
  return { start: today.start - (days - 1) * 86_400, end: today.end }
}

export function getLocalMonthRange(date: Date): TimeRange {
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
  return { start: Math.floor(start / 1000), end: Math.floor(end / 1000) }
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

export async function getUsageTrends(range: TimeRange, bucket: 'min10' | 'hour' | 'day' = 'min10') {
  const value = await apiClient.get<Partial<UsageTrendPoint>[]>(`/api/usage/trends?${query(range, { bucket })}`)
  return Array.isArray(value) ? value.map(normalizeUsageTrend) : []
}

export async function getCurrentIpPurity() {
  return getCurrentIpPuritySummary() satisfies Promise<IpPuritySummary>
}
