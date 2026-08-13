import { describe, expect, it } from 'vitest'

import {
  buildActivityBuckets,
  calculateDaylight,
  calculateWeekNumber,
  calculateYearProgress,
  formatLunarDate,
  generateAmbientPalette,
  greetingForHour,
} from './useHomeDashboard'

describe('home dashboard calculations', () => {
  it('groups only same-day activity into 24 hourly buckets', () => {
    const date = new Date(2026, 6, 22, 12)
    const activity = [
      new Date(2026, 6, 22, 0, 5).getTime(),
      new Date(2026, 6, 22, 1, 55).getTime(),
      new Date(2026, 6, 22, 14, 30).getTime(),
      new Date(2026, 6, 22, 14, 45).getTime(),
      new Date(2026, 6, 21, 14, 30).getTime(),
    ]
    const buckets = buildActivityBuckets(activity, date)
    expect(buckets).toHaveLength(24)
    expect(buckets[0]).toBe(1)
    expect(buckets[1]).toBe(1)
    expect(buckets[14]).toBe(2)
    expect(buckets.reduce((sum, count) => sum + count, 0)).toBe(4)
  })

  it('calculates year progress with week number and quarter remainder', () => {
    const leapDay = calculateYearProgress(new Date(2024, 11, 31, 12))
    expect(leapDay).toMatchObject({ dayIndex: 366, totalDays: 366, remaining: 0 })
    expect(leapDay.percent).toBe(100)

    const midYear = calculateYearProgress(new Date(2026, 7, 13))
    expect(midYear).toMatchObject({ year: 2026, dayIndex: 225, monthIndex: 7, weekNumber: 33 })
    expect(midYear.remaining).toBe(140)
    expect(midYear.quarterRemaining).toBe(49)
  })

  it('calculates ISO week numbers with Monday as week start', () => {
    expect(calculateWeekNumber(new Date(2026, 0, 1))).toBe(1)
    expect(calculateWeekNumber(new Date(2026, 7, 13))).toBe(33)
    expect(calculateWeekNumber(new Date(2023, 0, 1))).toBe(52)
  })

  it('tracks the sun on the day arc and the moon on the night tails', () => {
    const dawn = calculateDaylight(new Date(2026, 6, 22, 5, 28))
    expect(dawn).toMatchObject({ percent: 0, isDay: true, sunT: 0 })
    expect(dawn.countdownLabel).toContain('距日落')

    const dusk = calculateDaylight(new Date(2026, 6, 22, 18, 6))
    expect(dusk.isDay).toBe(false)
    expect(dusk.nightT).toBe(0)
    expect(dusk.countdownLabel).toContain('距日出')

    const lateNight = calculateDaylight(new Date(2026, 6, 22, 2, 0))
    expect(lateNight.isDay).toBe(false)
    expect(lateNight.nightT).toBeGreaterThan(0.5)
  })

  it('formats lunar dates without trailing arabic digits', () => {
    const formatted = formatLunarDate(new Date(2026, 7, 13))
    if (formatted) {
      expect(formatted).toContain('月')
      expect(formatted).not.toMatch(/\d$/)
    }
  })

  it('generates a deterministic five-color palette per day', () => {
    const first = generateAmbientPalette(new Date(2026, 7, 13, 9))
    const again = generateAmbientPalette(new Date(2026, 7, 13, 23))
    expect(first).toHaveLength(5)
    first.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/))
    expect(again).toEqual(first)
    expect(generateAmbientPalette(new Date(2026, 7, 14, 9))).not.toEqual(first)
  })

  it('maps hours to greetings', () => {
    expect(greetingForHour(3)).toBe('凌晨好')
    expect(greetingForHour(10)).toBe('上午好')
    expect(greetingForHour(15)).toBe('下午好')
    expect(greetingForHour(23)).toBe('夜深了')
  })
})
