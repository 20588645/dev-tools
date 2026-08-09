import { apiClient } from '@/services/api-client'

/**
 * 部署面板接口层：服务器、构建/部署任务、部署历史与项目扫描。
 *
 * 项目实体本身由 `project-service` 负责（本地运行、首页与本页共用），这里只放
 * 部署专属能力。取代旧 `deploy.js` 里 30 处散落的 `API.*` 调用。
 */

const DEPLOY_TIMEOUT = 15_000
/** SSH 连接、远程目录浏览与构建发起都可能慢，单独给更长的超时。 */
const REMOTE_TIMEOUT = 30_000

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '')
const num = (value: unknown, fallback = 0) => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
)
const stringList = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(text).filter(Boolean) : []
)

/**
 * 时间戳归一成毫秒数。
 *
 * 后端历史与 last-deploy 的 `timestamp` 存的是 **ISO 字符串**
 * （如 `2026-06-28T16:42:00.000Z`），git-log 则可能给数字。此前一律用 `num()`
 * 解析，字符串拿不到数字直接落 0，导致时间列恒显示「—」。
 */
export function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

/* ==================== 服务器 ==================== */

export type ServerAuthType = 'password' | 'privateKey'

export interface DeployServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: ServerAuthType
  /**
   * 后端对所有响应统一回 `'******'`，真实密码只在建立 SFTP 连接时解密。
   * 空串表示未设置密码。**不要**把这个值回传给后端，见 `ServerInput`。
   */
  passwordMasked: string
  defaultRemotePath: string
  /** 可选的多个部署路径，供部署弹窗下拉选择。 */
  deployPaths: string[]
}

/** 服务器表单可写字段。`password` 缺省表示不修改现有密码。 */
export interface ServerInput {
  name: string
  host: string
  port: number | string
  username: string
  authType: ServerAuthType
  defaultRemotePath: string
  deployPaths: string[]
  password?: string
}

/**
 * 密码是否为后端返回的掩码值。
 *
 * 后端把所有响应里的密码替换成 `'******'`。用户不改密码时表单里留的就是这串
 * 星号，**必须识别并跳过提交**，否则会把字面量 `******` 写成真实密码，
 * 导致此后所有部署连接失败（见 assessment 4.3）。
 */
export function isMaskedPassword(value: string): boolean {
  return /^\*+$/.test(value)
}

/**
 * 按掩码规则组装服务器提交载荷。
 *
 * 这是唯一应该构造服务器写入体的地方——把掩码判断收在 service 层，
 * 页面就无法绕过它。
 */
export function buildServerPayload(input: ServerInput, passwordField: string): ServerInput {
  const payload: ServerInput = { ...input }
  delete payload.password
  if (passwordField && !isMaskedPassword(passwordField)) payload.password = passwordField
  return payload
}

export function normalizeServer(value: unknown): DeployServer {
  const row = record(value)
  return {
    id: text(row.id),
    name: text(row.name),
    host: text(row.host),
    port: num(row.port, 22),
    username: text(row.username) || 'root',
    authType: text(row.authType) === 'privateKey' ? 'privateKey' : 'password',
    passwordMasked: text(row.password),
    defaultRemotePath: text(row.defaultRemotePath) || '/',
    deployPaths: stringList(row.deployPaths),
  }
}

export async function getServers(signal?: AbortSignal): Promise<DeployServer[]> {
  const rows = await apiClient.request<unknown[]>('/api/servers', { signal, timeout: DEPLOY_TIMEOUT })
  return (rows ?? []).map(normalizeServer)
}

export async function createServer(payload: ServerInput): Promise<DeployServer> {
  const row = await apiClient.post<unknown>('/api/servers', payload, DEPLOY_TIMEOUT)
  return normalizeServer(row)
}

export async function updateServer(id: string, payload: ServerInput): Promise<DeployServer> {
  const row = await apiClient.put<unknown>(`/api/servers/${encodeURIComponent(id)}`, payload, DEPLOY_TIMEOUT)
  return normalizeServer(row)
}

export async function deleteServer(id: string): Promise<void> {
  await apiClient.delete(`/api/servers/${encodeURIComponent(id)}`, DEPLOY_TIMEOUT)
}

/** 连接测试。返回任务 id，进度经 WS 推送到 LogViewer。 */
export async function testServer(id: string): Promise<{ id: string }> {
  const row = record(await apiClient.post<unknown>(`/api/servers/${encodeURIComponent(id)}/test`, {}, REMOTE_TIMEOUT))
  return { id: text(row.id) }
}

export interface QuickTestResult {
  id: string
  ok: boolean
  duration: number
  error: string
}

/** 批量快速探测，不经 LogViewer，直接返回结果。 */
export async function quickTestServer(id: string): Promise<QuickTestResult> {
  const row = record(await apiClient.post<unknown>(`/api/servers/${encodeURIComponent(id)}/quick-test`, {}, REMOTE_TIMEOUT))
  return {
    id: text(row.id) || id,
    ok: row.success === true || row.status === 'success',
    duration: num(row.duration),
    error: text(row.error),
  }
}

export interface RemoteEntry {
  name: string
  isDir: boolean
  size: number
  /** 修改时间戳，列表里按本地化格式展示。 */
  mtime: number
}

export interface RemoteBrowseResult {
  /** 实际打开的目录。请求路径不可达时后端会回落到上级，故与入参可能不同。 */
  path: string
  items: RemoteEntry[]
  /** 后端发生回落时给出的说明文案，为空表示按预期打开。 */
  fallback: string
}

/**
 * 远程目录浏览，供部署路径选择使用。
 *
 * 注意返回的 `path` 可能不等于入参——目标不可达时后端回落到上级目录并给出
 * `fallback` 说明，调用方必须以返回值为准更新当前目录。
 */
export async function browseRemoteDir(serverId: string, dirPath: string): Promise<RemoteBrowseResult> {
  const row = record(await apiClient.post<unknown>(
    `/api/servers/${encodeURIComponent(serverId)}/browse`,
    { path: dirPath },
    REMOTE_TIMEOUT,
  ))
  const items = Array.isArray(row.items) ? row.items : []
  return {
    path: text(row.path) || dirPath,
    fallback: text(row.fallback),
    items: items.map((value) => {
      const entry = record(value)
      return {
        name: text(entry.name),
        isDir: entry.isDir === true,
        size: num(entry.size),
        mtime: num(entry.mtime),
      }
    }),
  }
}

/* ==================== FileZilla 导入 ==================== */

export interface FileZillaServer {
  name: string
  host: string
  port: number
  username: string
  /** host + port 已存在于本地服务器列表，决定弹窗的「已导入 / 将删除」三态。 */
  exists: boolean
}

export interface FileZillaSource {
  /** 后端定位到的配置文件路径；手动上传 XML 时为空。 */
  path: string
  servers: FileZillaServer[]
}

function normalizeFileZillaServer(value: unknown): FileZillaServer {
  const row = record(value)
  return {
    name: text(row.name),
    host: text(row.host),
    port: num(row.port, 22),
    username: text(row.username),
    exists: row.exists === true,
  }
}

export function normalizeFileZillaSource(value: unknown): FileZillaSource {
  const row = record(value)
  return {
    path: text(row.path),
    servers: Array.isArray(row.servers) ? row.servers.map(normalizeFileZillaServer) : [],
  }
}

/** 读取本机 FileZilla 站点管理器。未找到配置文件时后端回 404。 */
export async function getFileZillaServers(signal?: AbortSignal): Promise<FileZillaSource> {
  const row = await apiClient.request<unknown>('/api/servers/filezilla', { signal, timeout: DEPLOY_TIMEOUT })
  return normalizeFileZillaSource(row)
}

/** 解析用户手动选择的 FileZilla XML。 */
export async function parseFileZillaXml(xmlContent: string): Promise<FileZillaServer[]> {
  const row = await apiClient.post<unknown>('/api/servers/filezilla/parse', { xmlContent }, DEPLOY_TIMEOUT)
  return normalizeFileZillaSource(row).servers
}

export interface FileZillaImportResult {
  added: string[]
  /** host + port 已存在的条目会被跳过而非覆盖。 */
  skipped: string[]
}

/**
 * 导入选中的 FileZilla 服务器。
 *
 * 后端按服务器名匹配（`selected`），并按 host + port 去重；`xmlContent` 用于
 * 用户手动选文件的场景，缺省时后端自行定位本机 FileZilla 配置。
 */
export async function importFileZillaServers(selected: string[], xmlContent?: string): Promise<FileZillaImportResult> {
  const row = record(await apiClient.post<unknown>(
    '/api/servers/filezilla/import',
    xmlContent ? { selected, xmlContent } : { selected },
    DEPLOY_TIMEOUT,
  ))
  return { added: stringList(row.added), skipped: stringList(row.skipped) }
}

/* ==================== 构建与部署 ==================== */

export interface StartBuildInput {
  projectName: string
  modules: string[]
  nodeVersion: string
}

export interface StartDeployInput extends StartBuildInput {
  serverIds: string[]
  /** 兼容旧后端的单值字段，取 `serverIds[0]`。 */
  serverId: string
  remotePath: string
}

/**
 * 发起构建。返回任务 id。
 *
 * 调用方必须先 `useDeployTaskStore().begin()` 占锁，并在本调用抛错时
 * `abandon()` 解锁——请求未发出时后端不会回 WS 完成事件（见 assessment 4.2）。
 */
export async function startBuild(input: StartBuildInput): Promise<{ id: string }> {
  const row = record(await apiClient.post<unknown>('/api/deploy/build', input, REMOTE_TIMEOUT))
  return { id: text(row.id) }
}

export async function startDeploy(input: StartDeployInput): Promise<{ id: string }> {
  const row = record(await apiClient.post<unknown>('/api/deploy/start', input, REMOTE_TIMEOUT))
  return { id: text(row.id) }
}

/** 后端 `activeJobs` 里的任务类型，与历史记录的 `build-only` 命名不同。 */
export type ActiveJobType = 'build' | 'deploy'

export interface ActiveJob {
  id: string
  projectName: string
  type: ActiveJobType
  /** 任务当前阶段，用于恢复时把进度条推到正确的一步。 */
  phase: string
  startTime: number
  modules: string[]
  serverName: string
  /** 后端累积的全量日志，供刷新后回放。 */
  logs: Array<{ text: string, type: string }>
}

/**
 * 刷新/重连后的活跃任务恢复。无活跃任务时返回 null。
 *
 * 后端只维护单任务，`activeJobs` 为空或任务已超过 10 分钟时直接回 null。
 * 注意 `type` 是 `'build' | 'deploy'`——与历史记录里的 `'build-only'` 不同名，
 * 混用会让构建任务套上部署的 5 步进度集（legacy `checkActiveJob` 原有此错）。
 */
export async function getActiveJob(signal?: AbortSignal): Promise<ActiveJob | null> {
  const value = await apiClient.request<unknown>('/api/deploy/active', { signal, timeout: DEPLOY_TIMEOUT })
  if (!value || typeof value !== 'object') return null
  const row = record(value)
  const id = text(row.id)
  if (!id) return null
  return {
    id,
    projectName: text(row.projectName),
    type: text(row.type) === 'deploy' ? 'deploy' : 'build',
    phase: text(row.phase),
    startTime: num(row.startTime),
    modules: stringList(row.modules),
    serverName: text(row.serverName),
    logs: Array.isArray(row.logs)
      ? row.logs.map(entry => {
        const line = record(entry)
        return { text: text(line.text), type: text(line.type) || 'info' }
      })
      : [],
  }
}

export type DeployRecordType = 'build-only' | 'deploy'
export type DeployRecordStatus = 'success' | 'error'

export interface LastDeployInfo {
  type: DeployRecordType
  status: DeployRecordStatus
  modules: string[]
  serverName: string
  duration: string
  timestamp: number
}

function normalizeLastDeploy(value: unknown): LastDeployInfo | null {
  const row = record(value)
  if (!row.timestamp && !row.status) return null
  return {
    type: text(row.type) === 'deploy' ? 'deploy' : 'build-only',
    status: text(row.status) === 'success' ? 'success' : 'error',
    modules: stringList(row.modules),
    serverName: text(row.serverName),
    duration: text(row.duration),
    timestamp: normalizeTimestamp(row.timestamp),
  }
}

/** 项目卡上的「最近构建/部署」摘要。无记录时返回 null。 */
export async function getLastDeploy(projectName: string, signal?: AbortSignal): Promise<LastDeployInfo | null> {
  const row = await apiClient.request<unknown>(
    `/api/deploy/last/${encodeURIComponent(projectName)}`,
    { signal, timeout: DEPLOY_TIMEOUT },
  )
  return normalizeLastDeploy(row)
}

/* ==================== 部署历史 ==================== */

export interface HistoryItem {
  id: string
  projectName: string
  type: DeployRecordType
  status: DeployRecordStatus
  modules: string[]
  serverName: string
  nodeVersion: string
  remotePath: string
  duration: string
  timestamp: number
}

export function normalizeHistoryItem(value: unknown): HistoryItem {
  const row = record(value)
  return {
    id: text(row.id),
    projectName: text(row.projectName),
    type: text(row.type) === 'deploy' ? 'deploy' : 'build-only',
    status: text(row.status) === 'success' ? 'success' : 'error',
    modules: stringList(row.modules),
    serverName: text(row.serverName),
    nodeVersion: text(row.nodeVersion),
    remotePath: text(row.remotePath),
    duration: text(row.duration),
    timestamp: normalizeTimestamp(row.timestamp),
  }
}

export async function getHistory(signal?: AbortSignal): Promise<HistoryItem[]> {
  const rows = await apiClient.request<unknown[]>('/api/history', { signal, timeout: DEPLOY_TIMEOUT })
  return (rows ?? []).map(normalizeHistoryItem)
}

export interface HistoryLogLine {
  time: number
  type: string
  text: string
}

/**
 * 从 `GET /api/history/:id` 的响应里取出日志行。
 *
 * 后端把日志放在 `logs` 字段（`history.js` 读物理日志文件后逐行解析成
 * `{ time, type, text }`）。此前这里读的是 `lines` / `log`，两个字段都不存在，
 * 结果恒为空数组——「查看日志」永远看不到内容。
 */
export function normalizeHistoryLog(value: unknown): HistoryLogLine[] {
  const row = record(value)
  const lines = Array.isArray(row.logs) ? row.logs : []
  return lines.map((entry) => {
    const line = record(entry)
    return { time: num(line.time), type: text(line.type) || 'info', text: text(line.text) }
  })
}

/** 单条历史的完整日志，供「查看日志」回看。 */
export async function getHistoryLog(id: string, signal?: AbortSignal): Promise<HistoryLogLine[]> {
  return normalizeHistoryLog(
    await apiClient.request<unknown>(`/api/history/${encodeURIComponent(id)}`, { signal, timeout: DEPLOY_TIMEOUT }),
  )
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await apiClient.delete(`/api/history/${encodeURIComponent(id)}`, DEPLOY_TIMEOUT)
}

/** 批量删除。后端是 `DELETE /api/history` 带 body，不是独立的 batch 路由。 */
export async function deleteHistoryItems(ids: string[]): Promise<{ deleted: number }> {
  const row = record(await apiClient.delete<unknown>('/api/history', { ids }, DEPLOY_TIMEOUT))
  return { deleted: num(row.deleted, ids.length) }
}

export interface CleanupInput {
  keepDays: number
  keepPerProject: number
}

export interface CleanupResult {
  deleted: number
  after: number
}

/** 按「保留天数 + 每项目保留条数」整理历史。 */
export async function cleanupHistory(input: CleanupInput): Promise<CleanupResult> {
  const row = record(await apiClient.post<unknown>('/api/history/cleanup', input, DEPLOY_TIMEOUT))
  return { deleted: num(row.deleted), after: num(row.after) }
}

/* ==================== 项目扫描与添加 ==================== */

export interface AvailableProject {
  name: string
  path: string
  tool: string
  type: string
}

function normalizeAvailableProject(value: unknown): AvailableProject {
  const row = record(value)
  return {
    name: text(row.name),
    path: text(row.path),
    tool: text(row.tool),
    type: text(row.type),
  }
}

/** 扫描默认工作目录下可添加的项目。 */
export async function getAvailableProjects(signal?: AbortSignal): Promise<AvailableProject[]> {
  const rows = await apiClient.request<unknown[]>('/api/projects/available', { signal, timeout: DEPLOY_TIMEOUT })
  return (rows ?? []).map(normalizeAvailableProject)
}

export interface BrowseEntry {
  name: string
  path: string
  isProject: boolean
  tool: string
}

export interface BrowseResult {
  /** 当前所在目录的绝对路径。 */
  currentDir: string
  /** 浏览根目录。面包屑用它裁掉前缀，越过它向上不允许。 */
  root: string
  entries: BrowseEntry[]
}

/** 手动浏览本机目录添加项目。`dir` 为空表示从根开始。 */
export async function browseProjects(dir?: string, signal?: AbortSignal): Promise<BrowseResult> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : ''
  const row = record(await apiClient.request<unknown>(`/api/projects/browse${query}`, { signal, timeout: DEPLOY_TIMEOUT }))
  const entries = Array.isArray(row.entries) ? row.entries : []
  const root = text(row.root)
  return {
    currentDir: text(row.currentDir) || text(dir) || root,
    root,
    entries: entries.map((value) => {
      const entry = record(value)
      return {
        name: text(entry.name),
        path: text(entry.path),
        isProject: entry.isProject === true,
        tool: text(entry.tool),
      }
    }),
  }
}

export async function addProjects(paths: string[]): Promise<{ added: number }> {
  const row = record(await apiClient.post<unknown>('/api/projects/batch', { paths }, REMOTE_TIMEOUT))
  return { added: num(row.added, paths.length) }
}

export async function removeProject(name: string): Promise<void> {
  await apiClient.delete(`/api/projects/${encodeURIComponent(name)}`, DEPLOY_TIMEOUT)
}

export interface GitLogEntry {
  hash: string
  message: string
  author: string
  timestamp: number
}

/** 构建/部署弹窗里展示的最近提交，帮助确认要发的是哪个版本。 */
export async function getGitLog(projectName: string, signal?: AbortSignal): Promise<GitLogEntry[]> {
  const rows = await apiClient.request<unknown[]>(
    `/api/projects/${encodeURIComponent(projectName)}/git-log`,
    { signal, timeout: DEPLOY_TIMEOUT },
  )
  return (rows ?? []).map((value) => {
    const row = record(value)
    return {
      hash: text(row.hash),
      message: text(row.message),
      author: text(row.author),
      timestamp: normalizeTimestamp(row.timestamp),
    }
  })
}
