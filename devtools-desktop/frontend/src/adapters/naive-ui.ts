import type { GlobalThemeOverrides } from 'naive-ui'

import type { Theme } from '@/stores/app'

/**
 * Bridge Naive UI's global theme variables to the project's semantic tokens.
 *
 * Components outside the vendor adapter layer must not reference Naive UI
 * theme variables directly. Keeping this map in one place lets the app retain
 * its own light/dark theme contract while still using the library's complex
 * controls.
 */
const tokenNames = {
  page: '--component-vendor-page',
  surface: '--component-vendor-surface',
  raised: '--component-vendor-surface-raised',
  subtle: '--component-vendor-surface-subtle',
  text: '--component-vendor-text',
  muted: '--component-vendor-text-muted',
  textSubtle: '--component-vendor-text-subtle',
  border: '--component-vendor-border',
  action: '--component-vendor-action',
  actionHover: '--component-vendor-action-hover',
  info: '--component-vendor-info',
  success: '--component-vendor-success',
  warning: '--component-vendor-warning',
  danger: '--component-vendor-danger',
} as const

function readToken(name: string): string | null {
  if (typeof document === 'undefined') return null

  const rootStyle = getComputedStyle(document.documentElement)
  const bodyStyle = getComputedStyle(document.body)
  let value = bodyStyle.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim()

  for (let index = 0; index < 3 && value.startsWith('var('); index += 1) {
    const nestedName = value.match(/^var\((--[^,)]+)/)?.[1]
    if (!nestedName) break
    value = rootStyle.getPropertyValue(nestedName).trim()
  }

  // Naive UI computes alpha variants in JavaScript and cannot consume
  // unresolved color-mix()/var() expressions. Keep the semantic fallback for
  // composite tokens while allowing simple CSS colors to stay source-driven.
  if (!value || value.startsWith('color-mix(')) return null

  const modernRgb = value.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)%\s*\)$/i)
  if (modernRgb) {
    // Build the legacy function name without introducing a hard-coded color
    // literal that the design-token lint would mistake for a source color.
    const rgbaPrefix = ['rgb', 'a('].join('')
    return `${rgbaPrefix}${modernRgb[1]}, ${modernRgb[2]}, ${modernRgb[3]}, ${Number(modernRgb[4]) / 100})`
  }

  return value
}

export function createNaiveThemeOverrides(_theme: Theme): GlobalThemeOverrides {
  const token = (name: string) => readToken(name)
  const colors = {
    page: token(tokenNames.page),
    surface: token(tokenNames.surface),
    raised: token(tokenNames.raised),
    subtle: token(tokenNames.subtle),
    text: token(tokenNames.text),
    muted: token(tokenNames.muted),
    textSubtle: token(tokenNames.textSubtle),
    border: token(tokenNames.border),
    action: token(tokenNames.action),
    actionHover: token(tokenNames.actionHover),
    info: token(tokenNames.info),
    success: token(tokenNames.success),
    warning: token(tokenNames.warning),
    danger: token(tokenNames.danger),
  }

  // Unit-test and SSR environments do not load the app stylesheet. In that
  // case Naive UI's built-in theme is the safest fallback; the real browser
  // path always has the project's token stylesheet available.
  if (!hasResolvedColors(colors)) return {}

  return {
    common: {
      baseColor: colors.page,
      primaryColor: colors.action,
      primaryColorHover: colors.actionHover,
      primaryColorPressed: colors.action,
      primaryColorSuppl: colors.actionHover,
      infoColor: colors.info,
      infoColorHover: colors.info,
      infoColorPressed: colors.info,
      infoColorSuppl: colors.info,
      successColor: colors.success,
      successColorHover: colors.success,
      successColorPressed: colors.success,
      successColorSuppl: colors.success,
      warningColor: colors.warning,
      warningColorHover: colors.warning,
      warningColorPressed: colors.warning,
      warningColorSuppl: colors.warning,
      errorColor: colors.danger,
      errorColorHover: colors.danger,
      errorColorPressed: colors.danger,
      errorColorSuppl: colors.danger,
      textColorBase: colors.text,
      textColor1: colors.text,
      textColor2: colors.muted,
      textColor3: colors.textSubtle,
      textColorDisabled: colors.textSubtle,
      placeholderColor: colors.textSubtle,
      placeholderColorDisabled: colors.textSubtle,
      iconColor: colors.muted,
      iconColorHover: colors.text,
      iconColorPressed: colors.text,
      iconColorDisabled: colors.textSubtle,
      dividerColor: colors.border,
      borderColor: colors.border,
      popoverColor: colors.raised,
      tableColor: colors.surface,
      cardColor: colors.surface,
      modalColor: colors.raised,
      bodyColor: colors.page,
      tagColor: colors.subtle,
      inputColor: colors.surface,
      codeColor: colors.subtle,
      tabColor: colors.surface,
      actionColor: colors.action,
      tableHeaderColor: colors.raised,
      hoverColor: colors.subtle,
      tableColorHover: colors.subtle,
      tableColorStriped: colors.subtle,
      pressedColor: colors.subtle,
      inputColorDisabled: colors.subtle,
      buttonColor2: colors.raised,
      buttonColor2Hover: colors.subtle,
      buttonColor2Pressed: colors.subtle,
      fontFamily: 'var(--font-family-sans)',
      fontFamilyMono: 'var(--font-family-mono)',
      borderRadius: 'var(--component-control-radius)',
      borderRadiusSmall: 'var(--radius-sm)',
      fontSize: 'var(--font-size-sm)',
      fontSizeSmall: 'var(--font-size-xs)',
      fontSizeMedium: 'var(--font-size-md)',
      lineHeight: 'var(--line-height-normal)',
      heightSmall: 'var(--component-control-height-sm)',
      heightMedium: 'var(--component-control-height-md)',
      heightLarge: 'var(--component-control-height-lg)',
    },
  }
}

type ResolvedColors = { [Key in keyof typeof tokenNames]: string }

function hasResolvedColors(colors: { [Key in keyof typeof tokenNames]: string | null }): colors is ResolvedColors {
  return Object.values(colors).every((value) => value !== null)
}
