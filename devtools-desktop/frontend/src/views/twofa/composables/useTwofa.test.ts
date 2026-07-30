import { describe, expect, it } from 'vitest'

import type { TwofaAccount } from '@/services/modules/twofa-service'

import { formatTwofaCode, twofaAvatarText, twofaRemainingSeconds } from './useTwofa'

const account = (overrides: Partial<TwofaAccount> = {}): TwofaAccount => ({
  id: 'twofa-1',
  issuer: 'GitHub',
  accountName: 'ldy@example.com',
  tag: '',
  groupName: '开发',
  algorithm: 'SHA1',
  period: 30,
  digits: 6,
  favorite: false,
  lastUsedAt: 0,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  secretMasked: 'JBSW••••3PXP',
  secretTail: '3PXP',
  currentCode: '963253',
  remainingSeconds: 13,
  expiresAt: 0,
  ...overrides,
})

describe('formatTwofaCode', () => {
  it('groups six digit codes as 3-3 and eight digit codes as 4-4', () => {
    expect(formatTwofaCode('963253')).toBe('963 253')
    expect(formatTwofaCode('25575772')).toBe('2557 5772')
  })

  it('leaves unusual lengths untouched', () => {
    expect(formatTwofaCode('1234567')).toBe('1234567')
    expect(formatTwofaCode('')).toBe('')
  })
})

describe('twofaRemainingSeconds', () => {
  it('derives the remaining seconds from expiresAt so ticks stay local', () => {
    const nowMs = 1_785_367_540_000
    expect(twofaRemainingSeconds(account({ expiresAt: nowMs + 16_000 }), nowMs)).toBe(16)
  })

  it('falls back to remainingSeconds when expiresAt is missing', () => {
    expect(twofaRemainingSeconds(account({ expiresAt: 0, remainingSeconds: 7 }), 0)).toBe(7)
  })

  it('never reports outside the period bounds', () => {
    const nowMs = 1_000_000
    // 已过期
    expect(twofaRemainingSeconds(account({ expiresAt: nowMs - 5_000 }), nowMs)).toBe(0)
    // 时钟漂移导致的超长剩余要夹到周期上限
    expect(twofaRemainingSeconds(account({ expiresAt: nowMs + 900_000 }), nowMs)).toBe(30)
    expect(twofaRemainingSeconds(account({ period: 60, expiresAt: nowMs + 900_000 }), nowMs)).toBe(60)
  })
})

describe('twofaAvatarText', () => {
  it('uses the issuer initial and falls back to the account name', () => {
    expect(twofaAvatarText(account())).toBe('G')
    expect(twofaAvatarText(account({ issuer: '', accountName: 'ops@example.com' }))).toBe('O')
    expect(twofaAvatarText(account({ issuer: '钉钉' }))).toBe('钉')
  })
})
