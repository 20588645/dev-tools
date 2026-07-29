import { describe, expect, it } from 'vitest'

import { previousUsageQuery, readUsageRefreshSeconds, usageBucketForSpan, usageRangeQuery } from './useUsage'

describe('usage range queries', () => {
  const now = new Date(2026, 6, 29, 12)

  it('uses complete local-day bounds for today', () => {
    const result = usageRangeQuery('today', now)
    expect(result.bucket).toBe('min10')
    expect(result.query.end! - result.query.start!).toBe(86_400)
  })

  it('uses hour buckets for seven days and month, and day buckets for all', () => {
    expect(usageRangeQuery('7d', now).bucket).toBe('hour')
    expect(usageRangeQuery('month', now).bucket).toBe('hour')
    expect(usageRangeQuery('all', now)).toEqual({ query: {}, bucket: 'day' })
  })

  it('does not invent a comparison range for all history', () => {
    expect(previousUsageQuery('all', now)).toBeNull()
    expect(previousUsageQuery('today', now)?.end).toBe(usageRangeQuery('today', now).query.start)
  })
})

describe('refresh interval persistence', () => {
  const makeStorage = (value: string | null): Storage => ({
    getItem: () => value,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  })

  it('defaults to 30s when nothing was stored', () => {
    // Number(null) === 0 且 0 是合法的「关闭」档，未设置时不能被误判成关闭
    expect(readUsageRefreshSeconds(makeStorage(null))).toBe(30)
    expect(readUsageRefreshSeconds(makeStorage(''))).toBe(30)
    expect(readUsageRefreshSeconds(undefined)).toBe(30)
  })

  it('keeps an explicitly stored off switch', () => {
    expect(readUsageRefreshSeconds(makeStorage('0'))).toBe(0)
  })

  it('accepts known intervals and rejects anything else', () => {
    expect(readUsageRefreshSeconds(makeStorage('60'))).toBe(60)
    expect(readUsageRefreshSeconds(makeStorage('7'))).toBe(30)
    expect(readUsageRefreshSeconds(makeStorage('abc'))).toBe(30)
  })
})

describe('custom usage range', () => {
  const now = new Date(2026, 6, 29, 12)
  const day = 86_400
  // 2026-07-01 00:00 ~ 2026-07-11 00:00，共 10 天
  const start = Math.floor(new Date(2026, 6, 1).getTime() / 1000)
  const end = start + 10 * day

  it('passes the custom bounds through and picks granularity by span', () => {
    const result = usageRangeQuery('custom', now, { start, end })
    expect(result.query).toEqual({ start, end })
    expect(result.bucket).toBe('hour')
  })

  it('treats a zero end as following the current moment', () => {
    const result = usageRangeQuery('custom', now, { start, end: 0 })
    expect(result.query.end).toBe(Math.floor(now.getTime() / 1000))
  })

  it('compares against the equally long preceding window', () => {
    const previous = previousUsageQuery('custom', now, { start, end })
    expect(previous).toEqual({ start: start - 10 * day, end: start })
  })

  it('falls back to no range when custom bounds are missing or inverted', () => {
    expect(usageRangeQuery('custom', now, null)).toEqual({ query: {}, bucket: 'day' })
    expect(previousUsageQuery('custom', now, null)).toBeNull()
    expect(previousUsageQuery('custom', now, { start, end: start })).toBeNull()
  })

  it('scales bucket granularity with the span', () => {
    expect(usageBucketForSpan(day)).toBe('min10')
    expect(usageBucketForSpan(10 * day)).toBe('hour')
    expect(usageBucketForSpan(120 * day)).toBe('day')
  })
})
