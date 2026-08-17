import { apiClient, ApiError } from '@/services/api-client'

const PROFILE_TIMEOUT = 15_000
const CONNECT_TIMEOUT = 40_000

export type PublishMode = 'direct-sftp' | 'gateway-filezilla'

export interface GroupPublishDevice {
  projectName: string
  remotePath: string
}

export interface GroupPublishProfile {
  groupName: string
  publishMode: PublishMode
  gatewayUrl: string
  gatewayUsername: string
  passwordMasked: string
  devices: GroupPublishDevice[]
}

export interface GroupPublishInput {
  publishMode: PublishMode
  gatewayUrl: string
  gatewayUsername: string
  gatewayPassword?: string
  devices: GroupPublishDevice[]
}

export interface GatewayConnectResult {
  ok: boolean
  distPath: string
  remotePath: string
  message: string
}

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '').trim()

function normalizeMode(value: unknown): PublishMode {
  return text(value) === 'gateway-filezilla' ? 'gateway-filezilla' : 'direct-sftp'
}

function normalizeDevice(value: unknown): GroupPublishDevice {
  const row = record(value)
  return { projectName: text(row.projectName), remotePath: text(row.remotePath) }
}

export function emptyGroupPublishProfile(groupName = ''): GroupPublishProfile {
  return {
    groupName,
    publishMode: 'direct-sftp',
    gatewayUrl: '',
    gatewayUsername: '',
    passwordMasked: '',
    devices: [],
  }
}

export function normalizeGroupPublishProfile(value: unknown, fallbackName = ''): GroupPublishProfile {
  const row = record(value)
  const devices = Array.isArray(row.devices) ? row.devices.map(normalizeDevice).filter(item => item.projectName) : []
  return {
    groupName: text(row.groupName) || fallbackName,
    publishMode: normalizeMode(row.publishMode),
    gatewayUrl: text(row.gatewayUrl),
    gatewayUsername: text(row.gatewayUsername),
    passwordMasked: text(row.passwordMasked),
    devices,
  }
}

export function isGatewayPublish(profile: Pick<GroupPublishProfile, 'publishMode'> | null | undefined): boolean {
  return profile?.publishMode === 'gateway-filezilla'
}

export function remotePathForProject(profile: Pick<GroupPublishProfile, 'devices'> | null | undefined, projectName: string): string {
  return profile?.devices.find(item => item.projectName === projectName)?.remotePath ?? ''
}

export function assertGatewayProfileReady(
  profile: GroupPublishProfile | null | undefined,
  projectName: string,
): string {
  if (!isGatewayPublish(profile) || !profile) return '该分组仍是直连 SFTP，未启用网关交接'
  if (!profile.gatewayUrl) return '请先填写网关登录地址'
  if (!/^https?:\/\//i.test(profile.gatewayUrl)) return '网关地址必须是 http 或 https 链接'
  if (!profile.gatewayUsername) return '请先填写网关用户名'
  if (!profile.passwordMasked) return '请先保存网关密码'
  if (!remotePathForProject(profile, projectName)) return `请先为项目「${projectName}」填写远程路径`
  return ''
}

function groupPath(groupName: string): string {
  return `/api/group-publish/${encodeURIComponent(groupName)}`
}

export async function getGroupPublishProfiles(signal?: AbortSignal): Promise<Record<string, GroupPublishProfile>> {
  const value = await apiClient.request<unknown>('/api/group-publish', { signal, timeout: PROFILE_TIMEOUT })
  const map = record(value)
  return Object.fromEntries(
    Object.entries(map).map(([name, row]) => [name, normalizeGroupPublishProfile(row, name)]),
  )
}

export async function getGroupPublishProfile(groupName: string, signal?: AbortSignal): Promise<GroupPublishProfile> {
  const value = await apiClient.request<unknown>(groupPath(groupName), { signal, timeout: PROFILE_TIMEOUT })
  return normalizeGroupPublishProfile(value, groupName)
}

export async function saveGroupPublishProfile(
  groupName: string,
  input: GroupPublishInput,
): Promise<GroupPublishProfile> {
  const value = await apiClient.put(groupPath(groupName), input, PROFILE_TIMEOUT)
  return normalizeGroupPublishProfile(value, groupName)
}

export async function renameGroupPublishProfile(from: string, to: string): Promise<GroupPublishProfile> {
  const value = await apiClient.post(`${groupPath(from)}/rename`, { to }, PROFILE_TIMEOUT)
  return normalizeGroupPublishProfile(value, to)
}

export async function connectGroupGateway(
  groupName: string,
  projectName: string,
): Promise<GatewayConnectResult> {
  try {
    const value = record(await apiClient.post(`${groupPath(groupName)}/connect`, { projectName }, CONNECT_TIMEOUT))
    return {
      ok: Boolean(value.ok),
      distPath: text(value.distPath),
      remotePath: text(value.remotePath),
      message: text(value.message),
    }
  } catch (cause) {
    if (cause instanceof ApiError) {
      const details = record(cause.details)
      throw new ApiError(cause.message, cause.kind, {
        status: cause.status,
        details: {
          ...details,
          distPath: text(details.distPath),
          remotePath: text(details.remotePath),
        },
        cause,
      })
    }
    throw cause
  }
}

export function distPathFromConnectError(error: unknown): string {
  if (error instanceof ApiError) return text(record(error.details).distPath)
  return ''
}

export function remotePathFromConnectError(error: unknown): string {
  if (error instanceof ApiError) return text(record(error.details).remotePath)
  return ''
}
