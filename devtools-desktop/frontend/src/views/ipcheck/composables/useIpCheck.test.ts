import { describe, expect, it } from 'vitest'

import { validateIpTarget } from './useIpCheck'

describe('useIpCheck target validation', () => {
  it.each([
    '8.8.8.8',
    '2606:4700:4700::1111',
    '2001:db8:0:1:1:1:1:1',
    'example.com',
    'sub.example.com.',
  ])('accepts %s', (value) => {
    expect(validateIpTarget(value)).toBe('')
  })

  it.each([
    '',
    '999.1.1.1',
    '2001:::1',
    '2001:db8',
    'not a domain',
    'localhost',
  ])('rejects %s', (value) => {
    expect(validateIpTarget(value)).not.toBe('')
  })
})
