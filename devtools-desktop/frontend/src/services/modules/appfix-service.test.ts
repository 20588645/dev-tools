import { describe, expect, it } from 'vitest'

import { normalizeAppFixResult, normalizeSettleResult } from './appfix-service'

describe('normalizeAppFixResult', () => {
  it('fills missing arrays and derives a name from the path', () => {
    expect(normalizeAppFixResult({
      path: '/Applications/Demo.app',
      hadQuarantine: true,
      hasQuarantine: false,
    })).toMatchObject({
      path: '/Applications/Demo.app',
      name: 'Demo',
      attributes: [],
      cleared: [],
      remaining: [],
      hadQuarantine: true,
      hasQuarantine: false,
    })
  })
})

describe('normalizeSettleResult', () => {
  it('keeps copy and eject flags and nested repair', () => {
    expect(normalizeSettleResult({
      path: '/Applications/Demo.app',
      copied: true,
      ejected: 'yes',
      repair: { path: '/Applications/Demo.app', name: 'Demo', hadQuarantine: true },
    })).toMatchObject({
      path: '/Applications/Demo.app',
      copied: true,
      ejected: true,
      repair: { name: 'Demo', hadQuarantine: true },
    })
  })
})
