import { describe, expect, it } from 'vitest'

import { normalizeIpCheckResult } from '@/services/modules/ipcheck-service'

import { buildIpCheckInsight, buildNetworkRows, formatDeviceCount } from './ip-check-insight'

const sample = normalizeIpCheckResult({
  ip: '8.8.8.8',
  location: '美国 弗吉尼亚州 Ashburn',
  timezone: 'America/New_York',
  asn: 'AS15169',
  asn_owner: 'Google LLC',
  org: 'Google LLC',
  ip_type: '企业专线 IP',
  risk_score: '0%',
  risk_label: '极度纯净',
  native_ip: '非原生 IP',
  shared_users: '6 用户',
  shared_users_level: '优质共享',
  shared_users_percent: 10,
  openai_support: '完美支持',
  longitude: '39.03',
  latitude: '-77.5',
  _raw: {
    proxy: false,
    vpn: false,
    type: 'Business',
    devices_address: 6,
    devices_subnet: 0,
    country_code: 'US',
    isp: 'Google LLC',
  },
})

describe('ip check insight', () => {
  it('explains a clean exit and lists actionable checks', () => {
    const insight = buildIpCheckInsight(sample)
    expect(insight.purity).toBe(100)
    expect(insight.headline).toBe('当前出口纯净度良好')
    expect(insight.checks.map((item) => item.label)).toEqual([
      '代理 / VPN',
      '出口属性',
      '共享程度',
      '模型连接',
      '数据来源',
    ])
    expect(insight.checks[0]?.value).toBe('未发现隧道特征')
  })

  it('warns when the exit looks like a VPN', () => {
    const insight = buildIpCheckInsight({
      ...sample,
      riskScore: 66,
      vpnDetected: true,
      proxyDetected: true,
    })
    expect(insight.headline).toBe('当前出口不适合登录重要账号')
    expect(insight.nextStep).toContain('更换住宅或企业专线')
  })

  it('builds network rows without duplicating the ISP', () => {
    const rows = buildNetworkRows(sample)
    expect(rows.map((row) => row.label)).toEqual([
      'ASN',
      'ASN 所有者',
      '企业',
      '线路类型',
      '国家 / 地区',
      '时区',
      '经纬度',
      'IPv4 数值',
      '本地址设备',
      '同网段设备',
    ])
    expect(rows.find((row) => row.key === 'country')?.value).toBe('US · 美国 弗吉尼亚州 Ashburn')
    expect(rows.find((row) => row.key === 'addr')?.value).toBe('6 台')
  })

  it('keeps unobserved device counts as 未观测', () => {
    expect(formatDeviceCount(0, false)).toBe('未观测')
    expect(formatDeviceCount(0, true)).toBe('0 台')
  })
})
