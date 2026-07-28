import { afterEach, describe, expect, it } from 'vitest'

import { createNaiveThemeOverrides } from './naive-ui'

const adapterColorNames = [
  '--component-vendor-page',
  '--component-vendor-surface',
  '--component-vendor-surface-raised',
  '--component-vendor-surface-subtle',
  '--component-vendor-text',
  '--component-vendor-text-muted',
  '--component-vendor-text-subtle',
  '--component-vendor-border',
  '--component-vendor-action',
  '--component-vendor-action-hover',
  '--component-vendor-action-contrast',
  '--component-vendor-info',
  '--component-vendor-success',
  '--component-vendor-warning',
  '--component-vendor-danger',
] as const

afterEach(() => {
  for (const name of adapterColorNames) {
    document.documentElement.style.removeProperty(name)
  }
})

describe('Naive UI theme adapter', () => {
  it('keeps primary button text readable in every interaction state', () => {
    for (const name of adapterColorNames) {
      document.documentElement.style.setProperty(name, 'resolved-token')
    }
    document.documentElement.style.setProperty('--component-vendor-action-contrast', 'contrast-token')

    const button = createNaiveThemeOverrides('dark').Button

    expect(button).toMatchObject({
      textColorPrimary: 'contrast-token',
      textColorHoverPrimary: 'contrast-token',
      textColorPressedPrimary: 'contrast-token',
      textColorFocusPrimary: 'contrast-token',
      textColorDisabledPrimary: 'contrast-token',
    })
  })
})
