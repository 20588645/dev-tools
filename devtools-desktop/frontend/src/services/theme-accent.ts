/**
 * redesign-v2 主题色运行时切换的纯推导逻辑。
 *
 * 由一个主色 hex 推导整组 accent token（副色 / 悬停 / 渐变 / 淡化），
 * 副色推导公式与设计原型 shared.js 保持一致（色相 +26°、饱和上限 96、明度 +8 上限 72）。
 * 白字对比度不足（WCAG 图形/大字 3:1）时自动加深主色；状态色不属于本组、永不跟随。
 */

export interface AccentPalette {
  accent: string
  hover: string
  secondary: string
  gradient: string
  subtle: string
}

/** 换肤只覆盖这一组 token；重置时逐一移除 */
export const ACCENT_TOKEN_NAMES = [
  '--color-action',
  '--color-action-hover',
  '--color-action-secondary',
  '--color-action-gradient',
  '--color-action-subtle',
  '--color-focus-ring',
] as const

/**
 * 把 accent 写到 html 与 body。
 * 亮色变量挂在 body[data-theme="light"]，只写 :root 会被主题表盖掉；暗色默认在 :root，html 也要写。
 */
export function writeAccentPalette(palette: AccentPalette | null): void {
  if (typeof document === 'undefined') return
  const nodes = [document.documentElement, document.body]
  for (const node of nodes) {
    const style = node.style
    if (!palette) {
      for (const name of ACCENT_TOKEN_NAMES) style.removeProperty(name)
      continue
    }
    style.setProperty('--color-action', palette.accent)
    style.setProperty('--color-action-hover', palette.hover)
    style.setProperty('--color-action-secondary', palette.secondary)
    style.setProperty('--color-action-gradient', palette.gradient)
    style.setProperty('--color-action-subtle', palette.subtle)
    style.setProperty('--color-focus-ring', palette.accent)
  }
}

const HEX_ACCENT_PATTERN = /^#(?:[0-9a-f]{6})$/i

/** 白字按钮的最低对比度（WCAG 图形与大号文字标准 3:1） */
const MIN_WHITE_TEXT_CONTRAST = 3

export function isValidAccentHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_ACCENT_PATTERN.test(value)
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function hexToHsl(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  const l = (max + min) / 2
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return [h, s * 100, l * 100]
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

function relativeLuminance(hex: string): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** 与白色文字的 WCAG 对比度 */
export function contrastRatioAgainstWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05)
}

/** 主色过浅时逐步压暗明度，保证白字可读；已达标则原样（转小写）返回 */
export function normalizeAccentForContrast(hex: string): string {
  const [h, s, initialLightness] = hexToHsl(hex.toLowerCase())
  let lightness = initialLightness
  let out = hex.toLowerCase()
  for (let i = 0; i < 40 && contrastRatioAgainstWhite(out) < MIN_WHITE_TEXT_CONTRAST; i += 1) {
    lightness = Math.max(0, lightness - 2)
    out = hslToHex(h, s, lightness)
  }
  return out
}

/** 由主色推导整组 accent 值（gradient/subtle 为可直接落进 CSS 变量的表达式） */
export function deriveAccentPalette(inputHex: string): AccentPalette {
  const accent = normalizeAccentForContrast(inputHex)
  const [h, s, l] = hexToHsl(accent)
  const secondary = hslToHex((h + 26) % 360, Math.min(s, 96), Math.min(l + 8, 72))
  const hover = hslToHex(h, s, Math.min(l + 6, 78))
  return {
    accent,
    hover,
    secondary,
    gradient: `linear-gradient(135deg, ${accent}, ${secondary})`,
    subtle: `color-mix(in srgb, ${accent} 13%, transparent)`,
  }
}
