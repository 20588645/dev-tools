import { apiClient } from '@/services/api-client'

/**
 * 本地运行接口层。
 *
 * 14 个接口按副作用分区标注。**高副作用接口绝不由自动化在真实数据上调用**，
 * 尤其 `forceReleasePort` 会强杀任意占用该端口的进程组（不校验归属）。
 */

const RUN_TIMEOUT = 15_000
/** 启动会 spawn 真实 dev server 并等待端口检查，比普通查询慢。 */
const RUN_START_TIMEOUT = 30_000

export type RunJobStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
/** 编译态与进程态正交：服务可以「运行中 + 编译报错」。 */
export type RunCompileStatus = '' | 'compiling' | 'success' | 'warning' | 'error'
export type RunLogType = 'cmd' | 'info' | 'success' | 'warn' | 'error'

export interface RunJob {
  id: string
  projectName: string
  /** 兼容字段：等于 moduleNames[0]，新代码用 moduleNames。 */
  moduleName: string
  moduleNames: string[]
  includeHome: boolean
  command: string
  nodeVersion: string
  /** 后端推断或显式指定；0/'' 表示未知。 */
  port: number | string
  url: string
  status: RunJobStatus
  pid: number | null
  startedAt: number
  stoppedAt: number | null
  exitCode: number | null
  error: string
  compileStatus: RunCompileStatus
  compileError: string
  compileErrorAt: number | null
  /** 每次新报错自增，用于通知去重（同一次报错的重复推送不再提醒）。 */
  compileErrorSeq: number
  autoRestart: boolean
  autoRestartCount: number
  autoRestartMax: number
}

export interface RunLogEntry {
  text: string
  type: RunLogType
  time: number
}

export interface RunJobLogs extends RunJob {
  logs: RunLogEntry[]
}

export interface RunHistoryItem {
  id: string
  projectName: string
  /**
   * 后端表列名与返回字段均为 `modules`。旧前端读的是 `moduleNames`，导致历史
   * 「模块」列恒为空（F1）。这里以后端为准，并兼容两种键名。
   */
  modules: string[]
  command: string
  nodeVersion: string
  /** `success` 自然结束 / `stopped` 用户手动停止 / `error` 异常退出。 */
  status: 'success' | 'stopped' | 'error' | string
  startedAt: string
  stoppedAt: string
  duration: string
  exitCode: number
}

export interface PortCheckResult {
  port: number
  inUse: boolean
  pids: number[]
}

export interface PortOwner {
  inUse: boolean
  pid?: number
  pids?: number[]
  user?: string
  /** 进程名（basename）。 */
  command?: string
  /** 完整可执行路径，用于判断是否本应用启动。 */
  commandPath?: string
}

export interface StartRunInput {
  projectName: string
  command?: string
  moduleNames?: string[]
  nodeVersion?: string
  autoRestart?: boolean
  autoRestartMax?: number
  /**
   * 用户在配置里显式填写的端口。传入即强制覆盖后端的配置文件推断（F3）——
   * 显式输入优先于文件扫描；留空才走推断。
   */
  port?: number | string
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
const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
const stringList = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(text).filter(Boolean) : []
)

const RUN_STATUSES: RunJobStatus[] = ['starting', 'running', 'stopping', 'stopped', 'error']
const COMPILE_STATUSES: RunCompileStatus[] = ['', 'compiling', 'success', 'warning', 'error']
const LOG_TYPES: RunLogType[] = ['cmd', 'info', 'success', 'warn', 'error']

function normalizeStatus(value: unknown): RunJobStatus {
  const raw = text(value)
  return RUN_STATUSES.includes(raw as RunJobStatus) ? raw as RunJobStatus : 'stopped'
}

function normalizeCompileStatus(value: unknown): RunCompileStatus {
  const raw = text(value)
  return COMPILE_STATUSES.includes(raw as RunCompileStatus) ? raw as RunCompileStatus : ''
}

function normalizeLogType(value: unknown): RunLogType {
  const raw = text(value)
  return LOG_TYPES.includes(raw as RunLogType) ? raw as RunLogType : 'info'
}

export function normalizeRunJob(value: unknown): RunJob {
  const row = record(value)
  const moduleNames = stringList(row.moduleNames)
  return {
    id: text(row.id),
    projectName: text(row.projectName),
    moduleName: text(row.moduleName) || moduleNames[0] || '',
    moduleNames,
    includeHome: Boolean(row.includeHome),
    command: text(row.command),
    nodeVersion: text(row.nodeVersion),
    port: typeof row.port === 'number' ? row.port : text(row.port),
    url: text(row.url),
    status: normalizeStatus(row.status),
    pid: nullableNumber(row.pid),
    startedAt: number(row.startedAt),
    stoppedAt: nullableNumber(row.stoppedAt),
    exitCode: nullableNumber(row.exitCode),
    error: text(row.error),
    compileStatus: normalizeCompileStatus(row.compileStatus),
    compileError: text(row.compileError),
    compileErrorAt: nullableNumber(row.compileErrorAt),
    compileErrorSeq: number(row.compileErrorSeq),
    autoRestart: Boolean(row.autoRestart),
    autoRestartCount: number(row.autoRestartCount),
    autoRestartMax: number(row.autoRestartMax) || 3,
  }
}

function normalizeHistoryItem(value: unknown): RunHistoryItem {
  const row = record(value)
  // 兼容 `modules`（后端真实字段）与 `moduleNames`（旧前端误用的键）
  const modules = stringList(row.modules).length > 0 ? stringList(row.modules) : stringList(row.moduleNames)
  return {
    id: text(row.id),
    projectName: text(row.projectName),
    modules,
    command: text(row.command),
    nodeVersion: text(row.nodeVersion),
    status: text(row.status),
    startedAt: text(row.startedAt),
    stoppedAt: text(row.stoppedAt),
    duration: text(row.duration),
    exitCode: number(row.exitCode),
  }
}

/* ── 只读查询 ────────────────────────────────────────────────── */

/** 全量运行态。轮询与 WS 重连对账都用它，是进程状态的权威来源。 */
export async function getRunStatuses(signal?: AbortSignal): Promise<RunJob[]> {
  const value = await apiClient.request('/api/run/status', { signal, timeout: RUN_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeRunJob) : []
}

export async function getRunJobLogs(jobId: string, signal?: AbortSignal): Promise<RunJobLogs> {
  const value = record(await apiClient.request(`/api/run/${jobId}/logs`, { signal, timeout: RUN_TIMEOUT }))
  const logs = Array.isArray(value.logs) ? value.logs : []
  return {
    ...normalizeRunJob(value),
    logs: logs.map((entry) => {
      const row = record(entry)
      return { text: text(row.text), type: normalizeLogType(row.type), time: number(row.time) }
    }),
  }
}

export async function getRunHistory(signal?: AbortSignal): Promise<RunHistoryItem[]> {
  const value = await apiClient.request('/api/run/history', { signal, timeout: RUN_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeHistoryItem) : []
}

/** 仅匹配 LISTEN 套接字——客户端连接（如浏览器 HMR 重连）不算占用。 */
export async function checkPort(port: number | string, signal?: AbortSignal): Promise<PortCheckResult> {
  const value = record(await apiClient.request(`/api/run/port-check/${port}`, { signal, timeout: RUN_TIMEOUT }))
  return { port: number(value.port), inUse: Boolean(value.inUse), pids: Array.isArray(value.pids) ? value.pids.map(number) : [] }
}

/** 占用进程详情。`commandPath` 用于判断是否本应用启动，强释前必须展示。 */
export async function getPortOwner(port: number | string, signal?: AbortSignal): Promise<PortOwner> {
  const value = record(await apiClient.request(`/api/run/port-owner/${port}`, { signal, timeout: RUN_TIMEOUT }))
  if (!value.inUse) return { inUse: false }
  return {
    inUse: true,
    pid: nullableNumber(value.pid) ?? undefined,
    pids: Array.isArray(value.pids) ? value.pids.map(number) : [],
    user: text(value.user),
    command: text(value.command),
    commandPath: text(value.commandPath),
  }
}

/* ── 低副作用：仅删历史记录，不动进程 ──────────────────────── */

export async function deleteRunHistoryItem(id: string): Promise<void> {
  await apiClient.delete(`/api/run/history/${id}`, undefined, RUN_TIMEOUT)
}

export async function clearRunHistory(): Promise<void> {
  await apiClient.delete('/api/run/history', undefined, RUN_TIMEOUT)
}

/* ── 高副作用：操作真实进程。自动化不得在真实数据上调用 ──────── */

/** spawn 真实 dev server 进程。端口被外部进程占用时抛 EADDRINUSE。 */
export async function startRun(input: StartRunInput): Promise<RunJob> {
  return normalizeRunJob(await apiClient.post('/api/run/start', input, RUN_START_TIMEOUT))
}

/** SIGTERM → 2.5s 后 SIGKILL 整个进程树。 */
export async function stopRun(jobId: string): Promise<RunJob> {
  return normalizeRunJob(await apiClient.post(`/api/run/${jobId}/stop`, {}, RUN_TIMEOUT))
}

/**
 * 停掉旧进程后用同样配置就地重启。**接口立即返回**（后台才停+重启），
 * 因此调用方不能用「请求结束即解锁按钮」的写法，要等 WS 推回 running。
 */
export async function restartRun(jobId: string): Promise<RunJob> {
  return normalizeRunJob(await apiClient.post(`/api/run/${jobId}/restart`, {}, RUN_TIMEOUT))
}

export async function batchStopRun(projectNames: string[]): Promise<string[]> {
  const value = record(await apiClient.post('/api/run/batch-stop', { projectNames }, RUN_TIMEOUT))
  return stringList(value.stopped)
}

/** 多模块逐个打开 `<模块>.html#/`，单体开根地址。 */
export async function openRunUrls(jobId: string): Promise<string[]> {
  const value = record(await apiClient.post(`/api/run/${jobId}/open`, {}, RUN_TIMEOUT))
  const urls = stringList(value.urls)
  if (urls.length > 0) return urls
  const single = text(value.url)
  return single ? [single] : []
}

/**
 * ⚠️ 全项目副作用最大的操作：`process.kill(-pid, 'SIGKILL')` 强杀整个进程组，
 * **不校验该进程是否由本应用启动**。调用前必须让用户看到占用进程详情并二次确认。
 */
export async function forceReleasePort(pid: number): Promise<void> {
  await apiClient.post('/api/run/force-release', { pid }, RUN_TIMEOUT)
}

/** 拉起 VS Code 定位到行，失败回退系统 open。 */
export async function openInEditor(input: { projectName?: string; path: string; line?: number }): Promise<void> {
  await apiClient.post('/api/run/open-editor', { line: 1, ...input }, RUN_TIMEOUT)
}
