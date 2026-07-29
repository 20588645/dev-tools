import { apiClient, type ApiRequestOptions } from '@/services/api-client'

const MENU_ORDER_KEY = 'devtools-menu-order'
const NOTIFICATION_ENABLED_KEY = 'devtools-notifications-enabled'
const LIVE2D_ENABLED_KEY = 'devtools-live2d-enabled'
const CLICK_EFFECT_ENABLED_KEY = 'devtools-click-effect-enabled'

export const DEFAULT_MENU_ORDER = [
  'run',
  'deploy',
  'filetransfer',
  'terminal',
  'todo',
  'notes',
  'notebook',
  'editor',
  'ipcheck',
  'twofa',
  'usage',
] as const

export type SortableMenuPage = typeof DEFAULT_MENU_ORDER[number]
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export interface HealthInfo {
  status: string
  uptime: number
  pid: number | null
  version: string
  dataDir: string
}

export interface NodeRuntimeInfo {
  current: string
  versions: string[]
}

export interface BackupRecord {
  file: string
  size: number
  createdAt: number
}

export interface BackupSnapshot {
  backups: BackupRecord[]
  pendingRestore: boolean
}

export interface TestSidecarSnapshot {
  pids: number[]
}

interface TauriNotificationApi {
  isPermissionGranted?: () => Promise<boolean>
  requestPermission?: () => Promise<string>
  sendNotification?: (payload: {
    title: string
    body: string
    group?: string
    autoCancel?: boolean
  }) => void
}

interface LegacyTauriWindow {
  __TAURI__?: {
    notification?: TauriNotificationApi
  }
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
)

const asString = (value: unknown) => String(value ?? '')

const asFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function requestOptions(signal?: AbortSignal): ApiRequestOptions {
  return signal ? { signal } : {}
}

export function normalizeHealthInfo(value: unknown): HealthInfo {
  const record = asRecord(value)
  const pid = Number(record.pid)
  return {
    status: asString(record.status),
    uptime: asFiniteNumber(record.uptime),
    pid: Number.isFinite(pid) ? pid : null,
    version: asString(record.version),
    dataDir: asString(record.dataDir),
  }
}

export function normalizeNodeRuntime(value: unknown): NodeRuntimeInfo {
  const record = asRecord(value)
  return {
    current: asString(record.current),
    versions: Array.isArray(record.versions) ? record.versions.map(asString).filter(Boolean) : [],
  }
}

export function normalizeBackupSnapshot(value: unknown): BackupSnapshot {
  const record = asRecord(value)
  const backups = Array.isArray(record.backups)
    ? record.backups.map((item) => {
        const backup = asRecord(item)
        return {
          file: asString(backup.file),
          size: Math.max(0, asFiniteNumber(backup.size)),
          createdAt: Math.max(0, asFiniteNumber(backup.createdAt)),
        }
      }).filter((backup) => backup.file)
    : []

  return {
    backups: backups.sort((left, right) => right.createdAt - left.createdAt),
    pendingRestore: Boolean(record.pendingRestore),
  }
}

export function normalizeTestSidecars(value: unknown): TestSidecarSnapshot {
  const record = asRecord(value)
  return {
    pids: Array.isArray(record.pids)
      ? record.pids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0)
      : [],
  }
}

export async function getHealth(signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/health', requestOptions(signal))
  return normalizeHealthInfo(value)
}

export async function getNodeRuntime(signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/projects/node-versions/list', requestOptions(signal))
  return normalizeNodeRuntime(value)
}

export async function getBackups(signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/backup/list', requestOptions(signal))
  return normalizeBackupSnapshot(value)
}

export async function createBackup() {
  return apiClient.post<{ file?: string }>('/api/backup/create', {})
}

export async function stageBackupRestore(file: string) {
  return apiClient.post<{ ok?: boolean }>('/api/backup/restore', { file })
}

export async function cancelBackupRestore() {
  return apiClient.post<{ ok?: boolean }>('/api/backup/restore-cancel', {})
}

export async function deleteBackup(file: string) {
  return apiClient.delete<{ ok?: boolean }>(`/api/backup/${encodeURIComponent(file)}`)
}

export async function getTestSidecars(signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/system/test-sidecars', requestOptions(signal))
  return normalizeTestSidecars(value)
}

export async function killTestSidecars() {
  const value = await apiClient.post<unknown>('/api/system/test-sidecars/kill', {})
  const record = asRecord(value)
  return { killed: Math.max(0, asFiniteNumber(record.killed)) }
}

export async function startUpgrade() {
  return apiClient.post<{ ok?: boolean }>('/api/upgrade/start', {})
}

export function readMenuOrder(storage: Storage = globalThis.localStorage): SortableMenuPage[] {
  const defaults = [...DEFAULT_MENU_ORDER]
  try {
    const saved = JSON.parse(storage.getItem(MENU_ORDER_KEY) ?? '[]')
    if (!Array.isArray(saved)) return defaults
    const normalized = saved.filter((page): page is SortableMenuPage => (
      typeof page === 'string'
      && defaults.includes(page as SortableMenuPage)
    ))
    const unique = [...new Set(normalized)]
    return [...unique, ...defaults.filter((page) => !unique.includes(page))]
  } catch {
    return defaults
  }
}

export function writeMenuOrder(order: SortableMenuPage[], storage: Storage = globalThis.localStorage) {
  storage.setItem(MENU_ORDER_KEY, JSON.stringify(order))
}

export function resetSavedMenuOrder(storage: Storage = globalThis.localStorage) {
  storage.removeItem(MENU_ORDER_KEY)
}

export function readNotificationEnabled(storage: Storage = globalThis.localStorage) {
  return storage.getItem(NOTIFICATION_ENABLED_KEY) !== 'false'
}

export function writeNotificationEnabled(enabled: boolean, storage: Storage = globalThis.localStorage) {
  storage.setItem(NOTIFICATION_ENABLED_KEY, enabled ? 'true' : 'false')
}

export function readExperimentalPreferences(storage: Storage = globalThis.localStorage) {
  return {
    live2dEnabled: storage.getItem(LIVE2D_ENABLED_KEY) === 'true',
    clickEffectEnabled: storage.getItem(CLICK_EFFECT_ENABLED_KEY) === 'true',
  }
}

export function writeExperimentalPreference(
  key: 'live2d' | 'click-effect',
  enabled: boolean,
  storage: Storage = globalThis.localStorage,
) {
  storage.setItem(
    key === 'live2d' ? LIVE2D_ENABLED_KEY : CLICK_EFFECT_ENABLED_KEY,
    enabled ? 'true' : 'false',
  )
}

function getTauriNotificationApi(): TauriNotificationApi | null {
  const windowLike = globalThis as typeof globalThis & LegacyTauriWindow
  return windowLike.__TAURI__?.notification ?? null
}

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  const tauriNotification = getTauriNotificationApi()
  if (tauriNotification?.isPermissionGranted) {
    try {
      return await tauriNotification.isPermissionGranted() ? 'granted' : 'default'
    } catch {
      // Fall back to the browser API below.
    }
  }
  if (!('Notification' in globalThis)) return 'unsupported'
  return globalThis.Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const tauriNotification = getTauriNotificationApi()
  if (tauriNotification?.requestPermission) {
    try {
      const permission = await tauriNotification.requestPermission()
      return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default'
    } catch {
      // Fall back to the browser API below.
    }
  }
  if (!('Notification' in globalThis)) return 'unsupported'
  return globalThis.Notification.requestPermission()
}

export async function sendTestNotification() {
  const tauriNotification = getTauriNotificationApi()
  const payload = {
    title: 'DevTools 通知已开启',
    body: '构建、部署任务完成后会通过系统通知提醒你。',
    group: 'devtools-tasks',
    autoCancel: true,
  }
  if (tauriNotification?.sendNotification) {
    tauriNotification.sendNotification(payload)
    return
  }
  if ('Notification' in globalThis && globalThis.Notification.permission === 'granted') {
    const notification = new globalThis.Notification(payload.title, { body: payload.body })
    globalThis.setTimeout(() => notification.close(), 10_000)
  }
}
