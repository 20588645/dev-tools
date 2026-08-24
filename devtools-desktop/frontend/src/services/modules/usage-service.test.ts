import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  buildUsageQuery,
  forceUsageScan,
  getUsageSummary,
  normalizeUsageLog,
  normalizeUsageSummary,
  syncCursorUsage,
  syncUsagePricing,
} from './usage-service'

describe('usage service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes nullable and out-of-range values', () => {
    expect(normalizeUsageSummary({
      requests: '12',
      totalTokens: '100',
      pricingCoverage: 1.4,
      cacheHitRate: '0.5',
    })).toMatchObject({
      requests: 12,
      totalTokens: 100,
      pricingCoverage: 1,
      cacheHitRate: 0.5,
      costMicroUsd: 0,
    })
    expect(normalizeUsageLog({ requestId: 'r1', model: null, createdAt: '123' })).toMatchObject({
      requestId: 'r1',
      model: '',
      createdAt: 123,
    })
  })

  it('builds only the supported query fields', () => {
    expect(buildUsageQuery(
      { start: 100, end: 200, app: 'codex' },
      { bucket: 'hour', page: 2 },
    )).toBe('?start=100&end=200&app=codex&bucket=hour&page=2')
    expect(buildUsageQuery({ app: 'cursor' })).toBe('?app=cursor')
  })

  it('passes abort ownership through dashboard reads', async () => {
    const controller = new AbortController()
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({ requests: 2 } as never)

    await expect(getUsageSummary({ app: 'claude' }, controller.signal)).resolves.toMatchObject({ requests: 2 })
    expect(request).toHaveBeenCalledWith('/api/usage/summary?app=claude', {
      signal: controller.signal,
      timeout: 30_000,
    })
  })

  it('normalizes the automatic pricing overwrite summary', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      fetchedAt: '123',
      total: 4,
      applied: '2',
      unchanged: 1,
      unmatched: 1,
      conflicts: 1,
      repriced: 99,
      sources: [{ source: 'models.dev', ok: true, count: '10' }],
    } as never)

    await expect(syncUsagePricing()).resolves.toMatchObject({
      fetchedAt: 123,
      applied: 2,
      unchanged: 1,
      unmatched: 1,
      conflicts: 1,
      repriced: 99,
      sources: [{ source: 'models.dev', ok: true, count: 10 }],
    })
  })

  it('keeps local scan counts on a forced refresh', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      files: 4,
      upserted: 12,
    } as never)
    await expect(forceUsageScan()).resolves.toEqual({
      files: 4,
      upserted: 12,
    })
  })

  it('posts Cursor official usage to a dedicated sync endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      upserted: '8',
      cursorError: '',
    } as never)
    await expect(syncCursorUsage()).resolves.toEqual({
      upserted: 8,
      cursorError: '',
    })
    expect(post).toHaveBeenCalledWith('/api/usage/sync/cursor', {}, 60_000)
  })
})
