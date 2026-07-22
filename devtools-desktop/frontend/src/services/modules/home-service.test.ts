import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  getCurrentIpPurity,
  getLocalDayRange,
  getPreviousDayRange,
  getUsageSummary,
  getUsageTrends,
} from './home-service'

describe('home service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds local today and previous-day ranges without UTC drift', () => {
    const date = new Date(2026, 6, 22, 15, 30)
    const expectedStart = Math.floor(new Date(2026, 6, 22).getTime() / 1000)

    expect(getLocalDayRange(date)).toEqual({ start: expectedStart, end: expectedStart + 86_400 })
    expect(getPreviousDayRange(date)).toEqual({ start: expectedStart - 86_400, end: expectedStart })
  })

  it('normalizes usage summaries and requests real min10 trends', async () => {
    const get = vi.spyOn(apiClient, 'get')
    get
      .mockResolvedValueOnce({ totalTokens: 1200, costUsd: 1.25, requests: 4 } as never)
      .mockResolvedValueOnce([{
        bucket: '2026-07-22 14:10',
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 20,
        cacheCreationTokens: 2,
      }] as never)

    const range = { start: 100, end: 200 }
    await expect(getUsageSummary(range)).resolves.toMatchObject({
      totalTokens: 1200,
      costUsd: 1.25,
      requests: 4,
      cacheHitRate: 0,
    })
    await expect(getUsageTrends(range)).resolves.toEqual([expect.objectContaining({
      bucket: '2026-07-22 14:10',
      inputTokens: 10,
      cacheReadTokens: 20,
      requests: 0,
    })])
    expect(get).toHaveBeenNthCalledWith(2, '/api/usage/trends?start=100&end=200&bucket=min10')
  })

  it('normalizes the current IP risk response', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      ip: '127.0.0.1',
      location: '本地',
      risk_score: '15%',
      risk_label: '极度纯净',
      ip_type: '住宅 IP',
      native_ip: '原生 IP',
    } as never)

    await expect(getCurrentIpPurity()).resolves.toEqual({
      ip: '127.0.0.1',
      location: '本地',
      riskScore: 15,
      riskLabel: '极度纯净',
      ipType: '住宅 IP',
      nativeIp: '原生 IP',
    })
    expect(apiClient.get).toHaveBeenCalledWith('/api/ipcheck/lookup', 20_000)
  })
})
