import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as usageService from '@/services/modules/usage-service'
import { previousUsageQuery, readUsageRefreshSeconds, usageBucketForSpan, usageRangeQuery, useUsage } from './useUsage'

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

  it('re-expands a follow-now end against the clock at query time', () => {
    const earlier = usageRangeQuery('custom', new Date(5_000_000), { start, end: 0 })
    const later = usageRangeQuery('custom', new Date(9_000_000), { start, end: 0 })
    expect(later.query.end).toBeGreaterThan(earlier.query.end!)
    expect(later.query.end).toBe(9_000)
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

describe('useUsage follow-now refresh', () => {
  const emptySummary = {
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
  }

  function createStorage(): Storage {
    const values = new Map<string, string>()
    return {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key) },
      setItem: (key, value) => { values.set(key, String(value)) },
    }
  }

  function createService() {
    return {
      ...usageService,
      getUsageSummary: vi.fn().mockResolvedValue(emptySummary),
      getUsageModels: vi.fn().mockResolvedValue([]),
      getUsageProjects: vi.fn().mockResolvedValue([]),
      getUsageRate: vi.fn().mockResolvedValue(null),
      getUsageTrends: vi.fn().mockResolvedValue([]),
      getUsageTop: vi.fn().mockResolvedValue([]),
      getUsageLogs: vi.fn().mockResolvedValue({ total: 0, page: 1, pageSize: 15, rows: [] }),
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('advances the follow-now end on each refresh instead of freezing it at confirm time', async () => {
    let current = new Date('2026-08-24T09:30:00+08:00')
    const service = createService()
    const pinia = createPinia()
    setActivePinia(pinia)
    let controller!: ReturnType<typeof useUsage>
    const wrapper = mount(defineComponent({
      setup() {
        controller = useUsage({
          service,
          storage: createStorage(),
          now: () => current,
        })
        return () => h('div')
      },
    }), { global: { plugins: [pinia] } })
    controller.range.value = 'custom'
    controller.customRange.value = {
      start: Math.floor(new Date('2026-08-24T08:40:00+08:00').getTime() / 1000),
      end: 0,
    }

    const currentEnds = () => service.getUsageSummary.mock.calls
      .map((call) => call[0] as { start?: number; end?: number })
      .filter((query) => query.start === controller.customRange.value?.start)
      .map((query) => query.end ?? 0)

    await controller.refresh()
    expect(currentEnds().at(-1)).toBe(Math.floor(current.getTime() / 1000))

    current = new Date('2026-08-24T09:51:00+08:00')
    await controller.refresh()
    expect(currentEnds().at(-1)).toBe(Math.floor(current.getTime() / 1000))
    expect(currentEnds().at(-1)).toBeGreaterThan(currentEnds()[0])
    wrapper.unmount()
  })
})
