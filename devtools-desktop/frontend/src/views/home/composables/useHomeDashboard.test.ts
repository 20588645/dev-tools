import { describe, expect, it } from 'vitest'

import type { UsageTrendPoint } from '@/services/modules/home-service'
import {
  buildActivityBuckets,
  buildUsageTrendBuckets,
  calculateDaylight,
  calculateMoonPhase,
  calculateYearProgress,
} from './useHomeDashboard'

describe('home dashboard calculations', () => {
  it('groups real activity and usage records into twelve two-hour buckets', () => {
    const date = new Date(2026, 6, 22, 12)
    const activity = [
      new Date(2026, 6, 22, 0, 5).getTime(),
      new Date(2026, 6, 22, 1, 55).getTime(),
      new Date(2026, 6, 22, 14, 30).getTime(),
      new Date(2026, 6, 21, 14, 30).getTime(),
    ]
    expect(buildActivityBuckets(activity, date)).toEqual([2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0])

    const point = (bucket: string, tokens: number): UsageTrendPoint => ({
      bucket,
      requests: 1,
      inputTokens: tokens,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costMicroUsd: 0,
    })
    expect(buildUsageTrendBuckets([
      point('2026-07-22 00:00', 5),
      point('2026-07-22 01:50', 7),
      point('2026-07-22 14:10', 11),
    ])).toEqual([12, 0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0])
  })

  it('calculates local year, daylight and moon presentation data', () => {
    const leapDay = calculateYearProgress(new Date(2024, 11, 31, 12))
    expect(leapDay).toMatchObject({ dayIndex: 366, totalDays: 366, remaining: 0 })
    expect(leapDay.percent).toBe(100)

    expect(calculateDaylight(new Date(2026, 6, 22, 5, 28)).percent).toBe(0)
    expect(calculateDaylight(new Date(2026, 6, 22, 18, 6)).percent).toBe(100)

    const moon = calculateMoonPhase(new Date(2026, 6, 22, 12))
    expect(moon.position).toBeGreaterThanOrEqual(0)
    expect(moon.position).toBeLessThan(100)
    expect(moon.illumination).toBeGreaterThanOrEqual(0)
    expect(moon.illumination).toBeLessThanOrEqual(100)
    expect(moon.name.length).toBeGreaterThan(0)
  })
})
