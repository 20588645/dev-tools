import { describe, expect, it } from 'vitest'

import { hasOfficialHolidayYear, officialHolidayOnDate } from './china-holidays'

describe('china holidays', () => {
  it('marks 2026 official rest and makeup workdays', () => {
    expect(officialHolidayOnDate(new Date(2026, 0, 1))).toMatchObject({ kind: 'off', label: '元旦' })
    expect(officialHolidayOnDate(new Date(2026, 0, 4))).toMatchObject({ kind: 'shift', name: '元旦' })
    expect(officialHolidayOnDate(new Date(2026, 1, 14))).toMatchObject({ kind: 'shift', name: '春节' })
    expect(officialHolidayOnDate(new Date(2026, 1, 17))).toMatchObject({ kind: 'off', label: '春节' })
    expect(officialHolidayOnDate(new Date(2026, 8, 20))).toMatchObject({ kind: 'shift', name: '国庆' })
    expect(officialHolidayOnDate(new Date(2026, 9, 1))).toMatchObject({ kind: 'off', label: '国庆' })
    expect(officialHolidayOnDate(new Date(2026, 7, 14))).toBeNull()
  })

  it('keeps 2025 Spring Festival and National Day / Mid-Autumn merged block', () => {
    expect(officialHolidayOnDate(new Date(2025, 0, 28))).toMatchObject({ label: '除夕' })
    expect(officialHolidayOnDate(new Date(2025, 9, 6))).toMatchObject({ label: '中秋' })
    expect(officialHolidayOnDate(new Date(2025, 9, 11))).toMatchObject({ kind: 'shift' })
  })

  it('does not invent makeup days for unpublished years', () => {
    expect(hasOfficialHolidayYear(2026)).toBe(true)
    expect(hasOfficialHolidayYear(2027)).toBe(false)
    expect(officialHolidayOnDate(new Date(2027, 0, 1))).toBeNull()
  })
})
