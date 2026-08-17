import type { IpCheckResult } from '@/services/modules/ipcheck-service'

export type InsightTone = 'success' | 'warning' | 'danger' | 'neutral'

export interface InsightCheck {
  key: string
  label: string
  value: string
  tone: InsightTone
}

export interface NetworkRow {
  key: string
  label: string
  value: string
  mono?: boolean
}

function present(value: string) {
  const normalized = value.trim()
  return normalized && normalized !== '未知'
}

export function formatDeviceCount(count: number, observed: boolean) {
  if (!observed) return '未观测'
  return `${count} 台`
}

export function buildIpCheckInsight(result: IpCheckResult) {
  const purity = Math.max(0, Math.min(100, 100 - result.riskScore))
  const proxyValue = result.vpnDetected
    ? '检测到 VPN'
    : result.proxyDetected
      ? '检测到代理'
      : '未发现隧道特征'
  const modelRestricted = /限制|风险|高危/.test(result.openAiSupport)
  const shareTone: InsightTone = result.sharedUsersPercent <= 35
    ? 'success'
    : result.sharedUsersPercent <= 65
      ? 'warning'
      : 'danger'

  const checks: InsightCheck[] = [
    {
      key: 'proxy',
      label: '代理 / VPN',
      value: proxyValue,
      tone: result.vpnDetected || result.proxyDetected ? 'warning' : 'success',
    },
    {
      key: 'native',
      label: '出口属性',
      value: result.nativeIp,
      tone: result.nativeIp === '原生 IP' ? 'success' : 'neutral',
    },
    {
      key: 'share',
      label: '共享程度',
      value: `${result.sharedUsersLevel} · ${result.sharedUsersPercent}%`,
      tone: shareTone,
    },
    {
      key: 'model',
      label: '模型连接',
      value: result.openAiSupport,
      tone: modelRestricted ? 'warning' : 'success',
    },
    {
      key: 'source',
      label: '数据来源',
      value: `${result.providerName} · ${result.riskSource}`,
      tone: 'neutral',
    },
  ]

  let headline = '当前出口纯净度良好'
  let nextStep = '适合日常登录与内容操作，仍建议账号与设备绑定同一出口。'
  if (result.riskScore > 50 || result.vpnDetected) {
    headline = '当前出口不适合登录重要账号'
    nextStep = '更换住宅或企业专线后再用于支付、店铺或社媒登录。'
  }
  else if (result.riskScore > 25 || result.proxyDetected) {
    headline = '当前出口存在限制信号'
    nextStep = '先做小范围验证，避免直接用于资金或主账号。'
  }
  else if (purity < 85) {
    headline = '当前出口可以正常使用'
    nextStep = '保持设备和账号环境一致，重要操作前可再测一次。'
  }

  return { purity, headline, nextStep, checks }
}

export function buildNetworkRows(result: IpCheckResult): NetworkRow[] {
  const rows: Array<NetworkRow & { hide?: boolean }> = [
    { key: 'asn', label: 'ASN', value: result.asn, mono: true },
    { key: 'owner', label: 'ASN 所有者', value: result.asnOwner },
    { key: 'org', label: '企业', value: result.organization },
    {
      key: 'isp',
      label: '运营商',
      value: result.isp,
      hide: !present(result.isp) || result.isp === result.organization,
    },
    { key: 'line', label: '线路类型', value: result.lineType },
    {
      key: 'country',
      label: '国家 / 地区',
      value: [result.countryCode, result.location].filter(present).join(' · ') || result.location,
    },
    { key: 'timezone', label: '时区', value: result.timezone, mono: true, hide: !present(result.timezone) },
    { key: 'geo', label: '经纬度', value: result.coordinates, mono: true },
    { key: 'ipn', label: 'IPv4 数值', value: result.ipNumber, mono: true, hide: result.ipNumber === '—' },
    {
      key: 'addr',
      label: '本地址设备',
      value: formatDeviceCount(result.devicesAddress, result.sharedUsersObserved),
    },
    {
      key: 'subnet',
      label: '同网段设备',
      value: formatDeviceCount(result.devicesSubnet, result.sharedUsersObserved),
    },
  ]
  return rows.filter((row) => !row.hide && present(row.value)).map(({ hide: _hide, ...row }) => row)
}
