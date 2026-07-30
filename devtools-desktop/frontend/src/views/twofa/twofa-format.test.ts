import { describe, expect, it } from 'vitest'

import { formatTwofaTime, parseOtpauthUri, parseTwofaImportText } from './twofa-format'

describe('parseOtpauthUri', () => {
  it('reads issuer, account and parameters from a standard uri', () => {
    const result = parseOtpauthUri('otpauth://totp/GitHub:ldy@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&period=60&digits=8&algorithm=SHA256')
    expect(result).toEqual({
      issuer: 'GitHub',
      accountName: 'ldy@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      period: 60,
      digits: 8,
      algorithm: 'SHA256',
    })
  })

  it('falls back to defaults and to the label when parameters are absent', () => {
    const result = parseOtpauthUri('otpauth://totp/ops@example.com?secret=MZXW6YTBOI')
    expect(result?.issuer).toBe('ops@example.com')
    expect(result?.accountName).toBe('ops@example.com')
    expect(result?.period).toBe(30)
    expect(result?.digits).toBe(6)
    expect(result?.algorithm).toBe('SHA1')
  })

  it('rejects anything that is not a totp uri or lacks a secret', () => {
    expect(parseOtpauthUri('otpauth://hotp/GitHub?secret=ABC')).toBeNull()
    expect(parseOtpauthUri('otpauth://totp/GitHub')).toBeNull()
    expect(parseOtpauthUri('https://example.com')).toBeNull()
    expect(parseOtpauthUri('')).toBeNull()
  })
})

describe('parseTwofaImportText', () => {
  it('parses a list of otpauth uris and skips invalid lines', () => {
    const items = parseTwofaImportText([
      'otpauth://totp/GitHub:a@example.com?secret=AAAA&issuer=GitHub',
      'not-a-uri',
      'otpauth://totp/AWS:b@example.com?secret=BBBB&issuer=AWS',
    ].join('\n'))
    expect(items.map((item) => item.issuer)).toEqual(['GitHub', 'AWS'])
  })

  it('accepts the exported wrapper object and a bare array', () => {
    const wrapped = parseTwofaImportText(JSON.stringify({
      accounts: [{ issuer: 'Google', accountName: 'g@example.com', secret: 'CCCC', groupName: '个人', favorite: true }],
    }))
    expect(wrapped).toHaveLength(1)
    expect(wrapped[0]).toMatchObject({ issuer: 'Google', groupName: '个人', favorite: true })

    const bare = parseTwofaImportText(JSON.stringify([{ issuer: 'Azure', accountName: 'z@example.com', secret: 'DDDD' }]))
    expect(bare[0]).toMatchObject({ issuer: 'Azure', groupName: '其他', period: 30, digits: 6 })
  })

  it('drops entries without a secret and returns nothing for broken json', () => {
    expect(parseTwofaImportText(JSON.stringify([{ issuer: 'NoSecret', accountName: 'x' }]))).toEqual([])
    expect(parseTwofaImportText('{ broken json')).toEqual([])
    expect(parseTwofaImportText('')).toEqual([])
  })
})

describe('formatTwofaTime', () => {
  it('reports unused for empty timestamps', () => {
    expect(formatTwofaTime(0)).toBe('未使用')
  })

  it('formats a second-level timestamp as month-day hour:minute', () => {
    // 2026-07-30 01:52 本地时间
    const seconds = Math.floor(new Date(2026, 6, 30, 1, 52).getTime() / 1000)
    expect(formatTwofaTime(seconds)).toMatch(/07-30\s+01:52/)
  })
})
