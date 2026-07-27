import { apiClient } from '@/services/api-client'

const IP_CHECK_TIMEOUT = 20_000

export type IpScenarioTone = 'success' | 'info' | 'warning' | 'danger'

interface IpCheckRawScenario {
  name?: unknown
  stars?: unknown
  advice?: unknown
}

interface IpCheckRawResponse {
  ip?: unknown
  location?: unknown
  asn?: unknown
  asn_owner_type?: unknown
  asn_owner?: unknown
  org_type?: unknown
  org?: unknown
  longitude?: unknown
  latitude?: unknown
  ip_type?: unknown
  risk_score?: unknown
  risk_label?: unknown
  native_ip?: unknown
  shared_users?: unknown
  shared_users_level?: unknown
  shared_users_percent?: unknown
  openai_support?: unknown
  scenarios?: unknown
  _raw?: {
    proxy?: unknown
    vpn?: unknown
    type?: unknown
    risk?: unknown
    devices_address?: unknown
    devices_subnet?: unknown
    isp?: unknown
    country_code?: unknown
  }
}

export interface IpPuritySummary {
  ip: string
  location: string
  riskScore: number
  riskLabel: string
  ipType: string
  nativeIp: string
}

export interface IpScenario {
  name: string
  advice: string
  description: string
  reason: string
  tone: IpScenarioTone
}

export interface IpCheckResult extends IpPuritySummary {
  asn: string
  asnOwner: string
  asnOwnerType: string
  organization: string
  organizationType: string
  latitude: string
  longitude: string
  coordinates: string
  ipNumber: string
  lineType: string
  sharedUsers: string
  sharedUsersLevel: string
  sharedUsersPercent: number
  sharedUsersObserved: boolean
  sharedUsersSource: string
  proxyDetected: boolean
  vpnDetected: boolean
  openAiSupport: string
  riskSource: string
  providerName: string
  scenarios: IpScenario[]
}

const stringValue = (value: unknown, fallback = '') => {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

const numberValue = (value: unknown) => {
  const normalized = Number(String(value ?? '').replace('%', ''))
  return Number.isFinite(normalized) ? normalized : 0
}

const clampRiskScore = (value: unknown) => Math.max(0, Math.min(100, numberValue(value)))

function ipv4Number(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return '—'
  return String(parts.reduce((total, part) => total * 256 + part, 0))
}

function scenarioTone(advice: string): IpScenarioTone {
  if (/高危|封号|失败|不推荐/.test(advice)) return 'danger'
  if (/风险|限制|谨慎/.test(advice)) return 'warning'
  if (/非常适合|完美支持|适合/.test(advice)) return 'success'
  return 'info'
}

function scenarioDescription(advice: string) {
  const tone = scenarioTone(advice)
  if (tone === 'danger' || tone === 'warning') return '当前网络身份存在限制或风险信号，建议更换线路后再验证。'
  if (tone === 'success') return '当前线路条件较稳定，仍建议保持账号与设备环境一致。'
  return '当前规则未发现明显阻断因素，建议小范围验证后使用。'
}

function scenarioReason(name: string, riskScore: number, ipType: string) {
  if (name === '跨境电商') return `综合风险 ${riskScore} / 100`
  if (name === '社媒运营') return `线路类型 · ${ipType || '未知'}`
  if (name === 'AI 应用') return '地区与风险规则综合判断'
  return '地区与代理状态综合判断'
}

function normalizeScenarios(value: unknown, riskScore: number, ipType: string): IpScenario[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const scenario = item as IpCheckRawScenario
    const name = stringValue(scenario.name, '未命名场景')
    const advice = stringValue(scenario.advice, '仅供参考')
    return {
      name,
      advice,
      description: scenarioDescription(advice),
      reason: scenarioReason(name, riskScore, ipType),
      tone: scenarioTone(advice),
    }
  })
}

function normalizeSharedUsers(value: unknown) {
  return stringValue(value, '未知').replace(/\s*用户$/, '')
}

export function normalizeIpCheckResult(value: IpCheckRawResponse | null | undefined): IpCheckResult {
  const ip = stringValue(value?.ip, '未知')
  const riskScore = clampRiskScore(value?.risk_score)
  const ipType = stringValue(value?.ip_type, '类型未知')
  const observedAddress = numberValue(value?._raw?.devices_address)
  const observedSubnet = numberValue(value?._raw?.devices_subnet)
  const sharedUsersObserved = observedAddress > 0 || observedSubnet > 0
  const proxyDetected = value?._raw?.proxy === true || value?._raw?.proxy === 'yes'
  const vpnDetected = value?._raw?.vpn === true || value?._raw?.vpn === 'yes'

  // 当前 Sidecar 历史契约把 lat 写在 longitude、lon 写在 latitude。
  // L3-A 会修复接口字段并提供兼容期；PG4 先在唯一归一化层还原正确显示顺序。
  const latitude = stringValue(value?.longitude, '未知')
  const longitude = stringValue(value?.latitude, '未知')
  const rawType = stringValue(value?._raw?.type, 'unknown')
  const ownerType = stringValue(value?.asn_owner_type)
  const organizationType = stringValue(value?.org_type)
  const lineType = [ownerType || organizationType, rawType === 'unknown' ? '' : rawType]
    .filter(Boolean)
    .join(' · ') || ipType

  return {
    ip,
    location: stringValue(value?.location, '位置未知'),
    riskScore,
    riskLabel: stringValue(value?.risk_label, '暂无评级'),
    ipType,
    nativeIp: stringValue(value?.native_ip, '属性未知'),
    asn: stringValue(value?.asn, '未知'),
    asnOwner: stringValue(value?.asn_owner, '未知'),
    asnOwnerType: ownerType,
    organization: stringValue(value?.org, '未知'),
    organizationType,
    latitude,
    longitude,
    coordinates: latitude === '未知' || longitude === '未知' ? '未知' : `${latitude}, ${longitude}`,
    ipNumber: ipv4Number(ip),
    lineType,
    sharedUsers: normalizeSharedUsers(value?.shared_users),
    sharedUsersLevel: stringValue(value?.shared_users_level, '来源未知'),
    sharedUsersPercent: clampRiskScore(value?.shared_users_percent),
    sharedUsersObserved,
    sharedUsersSource: sharedUsersObserved
      ? '来自 7 天设备观测，不代表精确在线人数'
      : '根据线路类型与风险规则估算，不代表精确在线人数',
    proxyDetected,
    vpnDetected,
    openAiSupport: stringValue(value?.openai_support, '未知').replace(/^[^\p{L}\p{N}]+/u, ''),
    riskSource: '基于当前第三方风控接口结果',
    providerName: 'Proxycheck',
    scenarios: normalizeScenarios(value?.scenarios, riskScore, ipType),
  }
}

export function toIpPuritySummary(result: IpCheckResult): IpPuritySummary {
  return {
    ip: result.ip,
    location: result.location,
    riskScore: result.riskScore,
    riskLabel: result.riskLabel,
    ipType: result.ipType,
    nativeIp: result.nativeIp,
  }
}

export async function lookupIp(target = '', signal?: AbortSignal) {
  const query = target ? `?ip=${encodeURIComponent(target)}` : ''
  const path = `/api/ipcheck/lookup${query}`
  const value = signal
    ? await apiClient.request<IpCheckRawResponse>(path, { timeout: IP_CHECK_TIMEOUT, signal })
    : await apiClient.get<IpCheckRawResponse>(path, IP_CHECK_TIMEOUT)
  return normalizeIpCheckResult(value)
}

export async function getCurrentIpPuritySummary() {
  return toIpPuritySummary(await lookupIp())
}
