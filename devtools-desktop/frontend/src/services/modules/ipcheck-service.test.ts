import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  getCurrentIpPuritySummary,
  lookupIp,
  normalizeIpCheckResult,
} from './ipcheck-service'

describe('ipcheck service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes the legacy response in one typed boundary', () => {
    const result = normalizeIpCheckResult({
      ip: '8.8.8.8',
      location: '美国 弗吉尼亚州',
      asn: 'AS15169',
      longitude: '39.03',
      latitude: '-77.5',
      risk_score: '15%',
      risk_label: '极度纯净',
      ip_type: '企业专线 IP',
      native_ip: '非原生 IP',
      shared_users: '6 用户',
      shared_users_level: '优质共享',
      shared_users_percent: 10,
      openai_support: '✅ 完美支持',
      timezone: 'America/New_York',
      scenarios: [{ name: 'AI 应用', advice: '完美支持', stars: '★★★★★' }],
      _raw: {
        type: 'Business',
        proxy: false,
        vpn: false,
        devices_address: 6,
        country_code: 'US',
        isp: 'Google LLC',
      },
    })

    expect(result).toMatchObject({
      ip: '8.8.8.8',
      riskScore: 15,
      latitude: '39.03',
      longitude: '-77.5',
      coordinates: '39.03, -77.5',
      ipNumber: '134744072',
      sharedUsers: '6',
      sharedUsersPercent: 10,
      sharedUsersObserved: true,
      proxyDetected: false,
      vpnDetected: false,
      openAiSupport: '完美支持',
      countryCode: 'US',
      timezone: 'America/New_York',
      devicesAddress: 6,
    })
    expect(result.scenarios).toEqual([expect.objectContaining({
      name: 'AI 应用',
      tone: 'success',
      rating: 5,
      reason: '地区与风险规则综合判断',
    })])
  })

  it('marks heuristic shared-user values as estimates', () => {
    const result = normalizeIpCheckResult({
      ip: '2606:4700:4700::1111',
      shared_users: '5 - 10 用户',
      _raw: { devices_address: 0, devices_subnet: 0 },
    })

    expect(result.ipNumber).toBe('—')
    expect(result.sharedUsersObserved).toBe(false)
    expect(result.sharedUsersSource).toContain('规则估算')
  })

  it('requests a target with an abort signal', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      ip: '8.8.8.8',
      risk_score: '0%',
    } as never)
    const controller = new AbortController()

    await expect(lookupIp('8.8.8.8', controller.signal)).resolves.toMatchObject({
      ip: '8.8.8.8',
      riskScore: 0,
    })
    expect(request).toHaveBeenCalledWith('/api/ipcheck/lookup?ip=8.8.8.8', {
      timeout: 20_000,
      signal: controller.signal,
    })
  })

  it('reuses the same normalizer for the home summary', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      ip: '127.0.0.1',
      location: '本地',
      risk_score: '12%',
      risk_label: '极度纯净',
      ip_type: '住宅 IP',
      native_ip: '原生 IP',
    } as never)

    await expect(getCurrentIpPuritySummary()).resolves.toEqual({
      ip: '127.0.0.1',
      location: '本地',
      riskScore: 12,
      riskLabel: '极度纯净',
      ipType: '住宅 IP',
      nativeIp: '原生 IP',
    })
  })
})
