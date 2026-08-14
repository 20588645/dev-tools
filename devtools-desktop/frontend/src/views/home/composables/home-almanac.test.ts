import { describe, expect, it } from 'vitest'

import {
  buildMonthCalendar,
  buildPhenologyWeek,
  phenologyOnDate,
  solarTermOnDate,
  startOfWeek,
} from './home-almanac'

describe('home almanac', () => {
  it('places 2026 solar terms on the expected civil dates', () => {
    expect(solarTermOnDate(new Date(2026, 7, 7))?.name).toBe('立秋')
    expect(solarTermOnDate(new Date(2026, 7, 23))?.name).toBe('处暑')
    expect(solarTermOnDate(new Date(2026, 7, 14))).toBeNull()
  })

  it('maps mid-立秋 to 次候 白露生', () => {
    const day = phenologyOnDate(new Date(2026, 7, 14))
    expect(day).toMatchObject({
      termName: '立秋',
      houName: '白露生',
      houStage: '次候',
      isTermDay: false,
    })
    expect(day.advice).toBeTruthy()
  })

  it('builds a Monday-start week with today highlighted', () => {
    const today = new Date(2026, 7, 14)
    const week = buildPhenologyWeek(today)
    expect(startOfWeek(today).getDate()).toBe(10)
    expect(week.days).toHaveLength(7)
    expect(week.days[0].day).toBe(10)
    expect(week.days[4]).toMatchObject({ day: 14, isToday: true, houName: '白露生' })
    expect(week.hint).toBe('立秋 · 白露生')
    expect(new Set(week.days.map((day) => day.advice)).size).toBe(7)
  })

  it('builds a 6-week month grid and marks solar-term days', () => {
    const today = new Date(2026, 7, 14)
    const calendar = buildMonthCalendar(today, today)
    expect(calendar.cells).toHaveLength(42)
    expect(calendar.monthLabel).toBe('2026年8月')
    expect(calendar.isCurrentMonth).toBe(true)
    expect(calendar.remainingDays).toBe(17)
    const todayCell = calendar.cells.find((cell) => cell.isToday)
    expect(todayCell).toMatchObject({ day: 14, inMonth: true })
    expect(calendar.cells.find((cell) => cell.day === 7 && cell.inMonth)?.solarTerm).toBe('立秋')
    expect(calendar.cells.find((cell) => cell.day === 23 && cell.inMonth)?.note).toBe('处暑')
  })

  it('can render another month and flags 2026 Spring Festival rest and makeup days', () => {
    const today = new Date(2026, 7, 14)
    const february = buildMonthCalendar(new Date(2026, 1, 1), today)
    expect(february.isCurrentMonth).toBe(false)
    expect(february.monthLabel).toBe('2026年2月')
    expect(february.cells.find((cell) => cell.key === '2026-02-17')).toMatchObject({
      badge: '休',
      note: '春节',
    })
    expect(february.cells.find((cell) => cell.key === '2026-02-14')).toMatchObject({
      badge: '班',
    })
    expect(february.offCount).toBe(9)
    expect(february.shiftCount).toBe(2)
    expect(february.footHint).toBe('休 9 · 班 2')
  })
})
