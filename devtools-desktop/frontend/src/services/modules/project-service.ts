import { apiClient } from '@/services/api-client'

/**
 * 项目实体接口层。
 *
 * 项目由本地运行、部署面板与首页共用（计划文档「与 run 共用项目 store」），
 * 因此放在 services/modules 而非某个页面私有目录。
 */

const PROJECT_TIMEOUT = 15_000

export type ProjectType = 'single' | 'multi-module'

export interface ProjectModule {
  name: string
  uploadStrategy: string
}

export interface Project {
  name: string
  displayName: string
  type: ProjectType
  tool: string
  nodeVersion: string
  buildCommand: string
  path: string
  modules: ProjectModule[]
  /** 本地运行相关字段 */
  runCommand: string
  /** 用户显式指定的服务端口；空串表示交给后端推断。 */
  runPort: string
  runHomeModule: string
  /** 默认 true：启动收藏模块时连带首页模块一起跑。 */
  runIncludeHome: boolean
  favoriteRunModules: string[]
  /** 分组名，空串表示未分组。存在项目实体上，不是本地偏好。 */
  groupName: string
  /* ---- 部署面板相关字段 ---- */
  /**
   * 默认部署目标服务器。
   *
   * 后端同时保留单值 `defaultServerId` 与数组 `defaultServerIds` 两个字段：
   * 数组是当前写入路径，单值是早期版本的兼容读取。取值统一走
   * `projectDefaultServerIds`，不要在页面里各自判断。
   */
  defaultServerIds: string[]
  defaultServerId: string
}

/**
 * 项目的默认部署服务器列表。
 *
 * 数组字段优先；为空时回落到单值字段，与旧 `getProjectDefaultServerIds` 等价。
 */
export function projectDefaultServerIds(project: Pick<Project, 'defaultServerIds' | 'defaultServerId'>): string[] {
  if (project.defaultServerIds.length > 0) return project.defaultServerIds
  return project.defaultServerId ? [project.defaultServerId] : []
}

/** 本地运行页可写的项目字段。其余字段（部署相关）不在本页范围内。 */
export interface RunConfigPatch {
  runCommand: string
  runPort: string
  runHomeModule: string
  runIncludeHome: boolean
  favoriteRunModules: string[]
  nodeVersion: string
  groupName: string
}

export interface NodeRuntime {
  versions: string[]
  current: string
}

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)
const text = (value: unknown) => String(value ?? '')
const stringList = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(text).filter(Boolean) : []
)

function normalizeModule(value: unknown): ProjectModule {
  const row = record(value)
  return { name: text(row.name), uploadStrategy: text(row.uploadStrategy) }
}

export function normalizeProject(value: unknown): Project {
  const row = record(value)
  const modules = Array.isArray(row.modules) ? row.modules.map(normalizeModule).filter(m => m.name) : []
  return {
    name: text(row.name),
    displayName: text(row.displayName) || text(row.name),
    type: text(row.type) === 'multi-module' ? 'multi-module' : 'single',
    tool: text(row.tool),
    nodeVersion: text(row.nodeVersion),
    buildCommand: text(row.buildCommand),
    path: text(row.path),
    modules,
    runCommand: text(row.runCommand),
    runPort: text(row.runPort),
    runHomeModule: text(row.runHomeModule) || 'home',
    // 后端可能不返回该字段；缺省视为 true（与旧 `!== false` 判定一致）
    runIncludeHome: row.runIncludeHome !== false,
    favoriteRunModules: stringList(row.favoriteRunModules),
    groupName: text(row.groupName).trim(),
    defaultServerIds: stringList(row.defaultServerIds),
    defaultServerId: text(row.defaultServerId),
  }
}

/** 无显式启动命令时按构建工具推断，与旧 `inferRunCommand` 一致。 */
export function inferRunCommand(project: Pick<Project, 'runCommand' | 'tool'>): string {
  if (project.runCommand) return project.runCommand
  if (project.tool === 'Vue CLI') return 'npm run serve'
  return 'npm run dev'
}

export async function getProjects(signal?: AbortSignal): Promise<Project[]> {
  const value = await apiClient.request('/api/projects', { signal, timeout: PROJECT_TIMEOUT })
  return Array.isArray(value) ? value.map(normalizeProject) : []
}

/** 局部更新项目。后端按传入字段合并，未传的字段保持原值。 */
export async function updateProject(name: string, patch: Partial<RunConfigPatch>): Promise<void> {
  await apiClient.put(`/api/projects/${encodeURIComponent(name)}`, patch, PROJECT_TIMEOUT)
}

export async function getNodeRuntime(signal?: AbortSignal): Promise<NodeRuntime> {
  const value = record(await apiClient.request('/api/projects/node-versions/list', { signal, timeout: PROJECT_TIMEOUT }))
  return { versions: stringList(value.versions), current: text(value.current) }
}
