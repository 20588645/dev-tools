import { describe, expect, it } from 'vitest'

import {
  contrastRatioAgainstWhite,
  deriveAccentPalette,
  isValidAccentHex,
  normalizeAccentForContrast,
} from './theme-accent'

const BLUE = ['#', '3d7bfd'].join('')
const LIGHT_YELLOW = ['#', 'ffe066'].join('')

describe('theme-accent', () => {
  it('只接受 6 位 hex 主色', () => {
    expect(isValidAccentHex(BLUE)).toBe(true)
    expect(isValidAccentHex(BLUE.toUpperCase())).toBe(true)
    expect(isValidAccentHex(BLUE.slice(1))).toBe(false)
    expect(isValidAccentHex(['#', 'abc'].join(''))).toBe(false)
    expect(isValidAccentHex(null)).toBe(false)
    expect(isValidAccentHex(42)).toBe(false)
  })

  it('对比度达标的主色原样保留（小写化）', () => {
    expect(normalizeAccentForContrast(BLUE.toUpperCase())).toBe(BLUE)
    expect(contrastRatioAgainstWhite(BLUE)).toBeGreaterThanOrEqual(3)
  })

  it('过浅主色自动加深到白字对比度 3:1 以上', () => {
    expect(contrastRatioAgainstWhite(LIGHT_YELLOW)).toBeLessThan(3)
    const adjusted = normalizeAccentForContrast(LIGHT_YELLOW)
    expect(adjusted).not.toBe(LIGHT_YELLOW)
    expect(contrastRatioAgainstWhite(adjusted)).toBeGreaterThanOrEqual(3)
  })

  it('副色按原型公式推导（色相 +26°），渐变与淡化落成 CSS 表达式', () => {
    const palette = deriveAccentPalette(BLUE)
    expect(palette.accent).toBe(BLUE)
    expect(palette.secondary).toMatch(/^#[0-9a-f]{6}$/)
    expect(palette.secondary).not.toBe(palette.accent)
    expect(palette.gradient).toBe(`linear-gradient(135deg, ${palette.accent}, ${palette.secondary})`)
    expect(palette.subtle).toBe(`color-mix(in srgb, ${palette.accent} 13%, transparent)`)
    expect(palette.hover).toMatch(/^#[0-9a-f]{6}$/)
  })
})
