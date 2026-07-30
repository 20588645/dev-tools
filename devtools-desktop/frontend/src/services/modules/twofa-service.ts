import { apiClient } from '@/services/api-client'

const TWOFA_TIMEOUT = 15_000

export type TwofaAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TwofaAccount {
  id: string
  issuer: string
  accountName: string
  tag: string
  groupName: string
  algorithm: TwofaAlgorithm
  period: number
  digits: number
  favorite: boolean
  lastUsedAt: number
  sortOrder: number
  createdAt: number
  updatedAt: number
  /** 后端只回遮罩，明文密钥不进前端状态 */
  secretMasked: string
  secretTail: string
  currentCode: string
  remainingSeconds: number
  /** 毫秒时间戳，前端据此本地推进倒计时，不必每秒请求 */
  expiresAt: number
}

export interface TwofaStats {
  total: number
  favorites: number
  groups: Record<string, number>
}

export interface TwofaAccountsPage {
  accounts: TwofaAccount[]
  stats: TwofaStats
}

export interface TwofaAccountInput {
  issuer: string
  accountName: string
  secret?: string
  tag?: string
  groupName?: string
  algorithm?: TwofaAlgorithm
  period?: number
  digits?: number
  favorite?: boolean
}

export interface TwofaImportResult {
  created: number
  updated: number
  total: number
}

/** 快捷查询结果：只是一次性计算，密钥不入库 */
export interface TwofaPreview {
  code: string
  remainingSeconds: number
  expiresAt: number
  algorithm: TwofaAlgorithm
  period: number
  digits: number
  issuer: string
  accountName: string
}

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '')
const number = (value: unknown) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}
const boolean = (value: unknown) => Boolean(value)

const normalizeAlgorithm = (value: unknown): TwofaAlgorithm => {
  const raw = text(value).toUpperCase()
  return raw === 'SHA256' || raw === 'SHA512' ? raw : 'SHA1'
}

function normalizeAccount(value: unknown): TwofaAccount {
  const row = record(value)
  const period = number(row.period) || 30
  return {
    id: text(row.id),
    issuer: text(row.issuer),
    accountName: text(row.accountName),
    tag: text(row.tag),
    groupName: text(row.groupName) || '其他',
    algorithm: normalizeAlgorithm(row.algorithm),
    period,
    digits: number(row.digits) || 6,
    favorite: boolean(row.favorite),
    lastUsedAt: number(row.lastUsedAt),
    sortOrder: number(row.sortOrder),
    createdAt: number(row.createdAt),
    updatedAt: number(row.updatedAt),
    secretMasked: text(row.secretMasked),
    secretTail: text(row.secretTail),
    currentCode: text(row.currentCode),
    remainingSeconds: number(row.remainingSeconds),
    expiresAt: number(row.expiresAt),
  }
}

function normalizeStats(value: unknown): TwofaStats {
  const row = record(value)
  const groups = record(row.groups)
  return {
    total: number(row.total),
    favorites: number(row.favorites),
    groups: Object.fromEntries(Object.entries(groups).map(([key, count]) => [key, number(count)])),
  }
}

export async function getTwofaAccounts(signal?: AbortSignal): Promise<TwofaAccountsPage> {
  const value = record(await apiClient.request('/api/twofa/accounts', { signal, timeout: TWOFA_TIMEOUT }))
  const list = Array.isArray(value.accounts) ? value.accounts : []
  return { accounts: list.map(normalizeAccount), stats: normalizeStats(value.stats) }
}

export async function createTwofaAccount(input: TwofaAccountInput): Promise<TwofaAccount> {
  return normalizeAccount(await apiClient.post('/api/twofa/accounts', input, TWOFA_TIMEOUT))
}

export async function updateTwofaAccount(id: string, input: TwofaAccountInput): Promise<TwofaAccount> {
  return normalizeAccount(await apiClient.put(`/api/twofa/accounts/${encodeURIComponent(id)}`, input, TWOFA_TIMEOUT))
}

export async function deleteTwofaAccount(id: string): Promise<void> {
  await apiClient.delete(`/api/twofa/accounts/${encodeURIComponent(id)}`, undefined, TWOFA_TIMEOUT)
}

/** 记录一次使用，用于「最近使用」排序 */
export async function touchTwofaAccount(id: string): Promise<void> {
  await apiClient.post(`/api/twofa/accounts/${encodeURIComponent(id)}/touch`, {}, TWOFA_TIMEOUT)
}

/**
 * 快捷查询：只把密钥送去算一次验证码，服务端不落库。
 * 入参支持裸 Base32 与 otpauth:// 链接。
 */
export async function previewTwofaCode(input: {
  secret: string
  algorithm?: TwofaAlgorithm
  period?: number
  digits?: number
}): Promise<TwofaPreview> {
  const value = record(await apiClient.post('/api/twofa/preview', input, TWOFA_TIMEOUT))
  return {
    code: text(value.code),
    remainingSeconds: number(value.remainingSeconds),
    expiresAt: number(value.expiresAt),
    algorithm: normalizeAlgorithm(value.algorithm),
    period: number(value.period) || 30,
    digits: number(value.digits) || 6,
    issuer: text(value.issuer),
    accountName: text(value.accountName),
  }
}

export async function importTwofaAccounts(accounts: TwofaAccountInput[]): Promise<TwofaImportResult> {
  const value = record(await apiClient.post('/api/twofa/import', { accounts }, 30_000))
  return { created: number(value.created), updated: number(value.updated), total: number(value.total) }
}
