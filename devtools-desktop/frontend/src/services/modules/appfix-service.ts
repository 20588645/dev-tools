import { apiClient } from '@/services/api-client'

const APPFIX_TIMEOUT = 120_000

export interface AppFixResult {
  path: string
  name: string
  attributes: string[]
  hasQuarantine: boolean
  hadQuarantine: boolean
  cleared: string[]
  remaining: string[]
}

export interface AppFixImageMount {
  mountPoint: string
  devEntry: string
}

export interface AppFixImageApp {
  path: string
  name: string
  mountPoint: string
}

export interface AppFixInstallImage {
  imagePath: string
  imageName: string
  volumeName: string
  mounts: AppFixImageMount[]
  apps: AppFixImageApp[]
}

export interface AppFixSettleResult {
  path: string
  name: string
  copied: boolean
  copySkipped: boolean
  ejected: boolean
  ejectError: string
  volumeName: string
  imagePath: string
  mountPoint: string
  onImage: boolean
  repair: AppFixResult | null
}

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '').trim()
const texts = (value: unknown) => (
  Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
)

export function normalizeAppFixResult(value: unknown): AppFixResult {
  const raw = record(value)
  const pathValue = text(raw.path)
  const attributes = texts(raw.attributes)
  const remaining = texts(raw.remaining)
  const cleared = texts(raw.cleared)
  return {
    path: pathValue,
    name: text(raw.name) || pathValue.replace(/\.app$/i, '').split('/').at(-1) || '',
    attributes,
    hasQuarantine: Boolean(raw.hasQuarantine),
    hadQuarantine: Boolean(raw.hadQuarantine),
    cleared,
    remaining: remaining.length ? remaining : attributes,
  }
}

export async function repairApp(path: string, signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/appfix/repair', {
    method: 'POST',
    body: JSON.stringify({ path }),
    timeout: APPFIX_TIMEOUT,
    signal,
  })
  return normalizeAppFixResult(value)
}

export function normalizeInstallImage(value: unknown): AppFixInstallImage {
  const raw = record(value)
  const mounts = Array.isArray(raw.mounts)
    ? raw.mounts.map((item) => {
      const mount = record(item)
      return { mountPoint: text(mount.mountPoint), devEntry: text(mount.devEntry) }
    }).filter((item) => item.mountPoint)
    : []
  const apps = Array.isArray(raw.apps)
    ? raw.apps.map((item) => {
      const app = record(item)
      return {
        path: text(app.path),
        name: text(app.name),
        mountPoint: text(app.mountPoint),
      }
    }).filter((item) => item.path)
    : []
  return {
    imagePath: text(raw.imagePath),
    imageName: text(raw.imageName) || text(raw.volumeName),
    volumeName: text(raw.volumeName),
    mounts,
    apps,
  }
}

export async function listInstallImages(signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/appfix/images', { signal, timeout: 15_000 })
  return Array.isArray(value) ? value.map(normalizeInstallImage) : []
}

export async function ejectDiskImage(mountPoint: string, signal?: AbortSignal) {
  const value = record(await apiClient.request<unknown>('/api/appfix/eject', {
    method: 'POST',
    body: JSON.stringify({ mountPoint }),
    timeout: 30_000,
    signal,
  }))
  return {
    ejected: Boolean(value.ejected),
    volumeName: text(value.volumeName),
    imagePath: text(value.imagePath),
    mountPoint: text(value.mountPoint),
  }
}

export function normalizeSettleResult(value: unknown): AppFixSettleResult {
  const raw = record(value)
  return {
    path: text(raw.path),
    name: text(raw.name),
    copied: Boolean(raw.copied),
    copySkipped: Boolean(raw.copySkipped),
    ejected: Boolean(raw.ejected),
    ejectError: text(raw.ejectError),
    volumeName: text(raw.volumeName),
    imagePath: text(raw.imagePath),
    mountPoint: text(raw.mountPoint),
    onImage: Boolean(raw.onImage),
    repair: raw.repair ? normalizeAppFixResult(raw.repair) : null,
  }
}

export async function settleInstall(path: string, signal?: AbortSignal) {
  const value = await apiClient.request<unknown>('/api/appfix/settle', {
    method: 'POST',
    body: JSON.stringify({ path }),
    timeout: APPFIX_TIMEOUT,
    signal,
  })
  return normalizeSettleResult(value)
}
