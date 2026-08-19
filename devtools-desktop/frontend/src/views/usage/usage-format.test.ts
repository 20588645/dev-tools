import { describe, expect, it } from 'vitest'

import {
  formatUsageCompact,
  formatUsagePercent,
  usageDelta,
  usageProjectName,
  usageTotalTokens,
  usageAppLabel,
  usageAppTone,
  usageModelTokens,
} from './usage-format'

describe('usage formatting', () => {
  it('keeps token and percentage formatting deterministic', () => {
    expect(usageTotalTokens({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
    })).toBe(100)
    expect(formatUsageCompact(324_134_964)).toBe('3.24 亿')
    expect(formatUsagePercent(0.956)).toBe('95.6%')
  })

  it('normalizes encoded Claude project paths and safe deltas', () => {
    expect(usageProjectName('-Users-ldy-personalTools')).toBe('personalTools')
    expect(usageProjectName('ldts')).toBe('ldts')
    expect(usageDelta(120, 100)).toBeCloseTo(0.2)
    expect(usageDelta(120, 0)).toBeNull()
    expect(usageAppLabel('cursor')).toBe('Cursor')
    expect(usageAppTone('cursor')).toBe('cursor')
    expect(usageAppTone('claude')).toBe('claude')
    expect(usageModelTokens({
      model: 'cursor-grok-4.6',
      displayName: 'Grok',
      appType: 'cursor',
      pricingModel: '',
      requests: 1,
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
      costMicroUsd: 0,
    })).toBe(100)
  })
})
