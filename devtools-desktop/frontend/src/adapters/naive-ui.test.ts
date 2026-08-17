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
    document.body.style.removeProperty(name)
  }
  document.documentElement.style.removeProperty('--color-action')
  document.body.style.removeProperty('--color-action')
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

  it('keeps input, select and button medium height on the same control token', () => {
    for (const name of adapterColorNames) {
      document.documentElement.style.setProperty(name, 'resolved-token')
    }

    const overrides = createNaiveThemeOverrides('dark')
    const height = 'var(--component-control-height-md)'

    expect(overrides.common?.heightMedium).toBe(height)
    expect(overrides.Button?.heightMedium).toBe(height)
    expect(overrides.Input?.heightMedium).toBe(height)
  })

  it('resolves vendor action from body accent so light theme does not keep the html default', () => {
    const bodyAccent = ['#', 'c8b52e'].join('')
    document.body.style.setProperty('--component-vendor-action', 'var(--color-action)')
    document.body.style.setProperty('--component-vendor-action-hover', 'var(--color-action)')
    document.body.style.setProperty('--component-vendor-action-contrast', 'contrast-token')
    document.documentElement.style.setProperty('--color-action', ['#', '3d7bfd'].join(''))
    document.body.style.setProperty('--color-action', bodyAccent)
    for (const name of adapterColorNames) {
      if (name.includes('action')) continue
      document.body.style.setProperty(name, 'resolved-token')
    }

    const common = createNaiveThemeOverrides('light').common
    expect(common?.primaryColor).toBe(bodyAccent)
  })
})
