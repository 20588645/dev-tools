import type { UsageLogRecord, UsageModelStat, UsageProjectStat, UsageTrendRow } from '@/services/modules/usage-service'

export const usageTotalTokens = (value: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}) => value.inputTokens + value.outputTokens + value.cacheReadTokens + value.cacheCreationTokens

export const formatUsageNumber = (value: number) => Math.round(Number(value) || 0).toLocaleString('en-US')

export function formatUsageCompact(value: number) {
  const number = Number(value) || 0
  if (number >= 1e8) return `${(number / 1e8).toFixed(2)} 亿`
  if (number >= 1e4) return `${(number / 1e4).toFixed(1)} 万`
  return formatUsageNumber(number)
}

export const formatUsagePercent = (value: number, digits = 1) => `${((Number(value) || 0) * 100).toFixed(digits)}%`

export const formatUsageCost = (microUsd: number) => `$${((Number(microUsd) || 0) / 1e6).toFixed(4)}`

export function formatUsageDate(unixSeconds: number) {
  const date = new Date((Number(unixSeconds) || 0) * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function usageProjectName(projectDir: string) {
  const value = String(projectDir || '')
  if (!value) return '(未知)'
  if (!value.startsWith('-')) return value
  const segments = value.split('-').filter(Boolean)
  return segments.at(-1) || '(未知)'
}

export const usageModelTokens = (model: UsageModelStat) => usageTotalTokens(model)
export const usageProjectTokens = (project: UsageProjectStat) => usageTotalTokens(project)
export const usageLogTokens = (log: UsageLogRecord) => usageTotalTokens(log)
export const usageTrendTokens = (trend: UsageTrendRow) => usageTotalTokens(trend)

export function usageDelta(current: number, previous: number) {
  if (!(previous > 0)) return null
  return (current - previous) / previous
}
