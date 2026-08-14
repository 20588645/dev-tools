import { describe, expect, it } from 'vitest'

import { adviceForDay, COMMON_TIPS, poolForSeason, SEASON_TIPS, seasonFromTerm } from './hou-advice'

describe('hou advice', () => {
  it('keeps a non-empty seasonal pool that consecutive days can walk without collision', () => {
    for (const season of ['春', '夏', '秋', '冬'] as const) {
      const pool = poolForSeason(season)
      expect(pool.length).toBeGreaterThanOrEqual(7)
      expect(pool.length % 17).not.toBe(0)
      expect(new Set(pool).size).toBe(pool.length)
      expect(SEASON_TIPS[season]).toHaveLength(18)
    }
    expect(COMMON_TIPS).toHaveLength(24)
  })

  it('maps solar terms onto the four seasons', () => {
    expect(seasonFromTerm('立秋')).toBe('秋')
    expect(seasonFromTerm('白露')).toBe('秋')
    expect(seasonFromTerm('立春')).toBe('春')
    expect(seasonFromTerm('立夏')).toBe('夏')
    expect(seasonFromTerm('立冬')).toBe('冬')
  })

  it('returns a stable tip for the same civil day', () => {
    const first = adviceForDay('2026-08-14', '立秋', null)
    const again = adviceForDay('2026-08-14', '立秋', null)
    expect(first).toBeTruthy()
    expect(again).toBe(first)
  })

  it('picks a different tip for each day of a week', () => {
    const keys = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']
    const tips = keys.map((key) => adviceForDay(key, '立秋', null))
    expect(new Set(tips).size).toBe(7)
  })

  it('prefers festival copy over the daily draw', () => {
    expect(adviceForDay('2026-09-25', '秋分', '中秋')).toContain('月圆')
    expect(adviceForDay('2026-09-25', '秋分', null)).not.toContain('月圆')
  })
})
