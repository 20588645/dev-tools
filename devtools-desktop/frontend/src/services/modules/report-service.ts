import { apiClient } from '@/services/api-client'

const REPORT_TIMEOUT = 180_000

interface ReportRepoConfigRaw {
  repo?: unknown
  branch?: unknown
  group?: unknown
}

interface ReportConfigRaw {
  token?: unknown
  author?: unknown
  outputDir?: unknown
  repos?: unknown
}

interface GitCommitRaw {
  date?: unknown
  author?: unknown
  subject?: unknown
  hash?: unknown
}

interface ReportRepoResultRaw {
  project?: unknown
  repo?: unknown
  branch?: unknown
  group?: unknown
  logs?: unknown
  error?: unknown
}

interface GenerateReportResponseRaw {
  results?: unknown
  markdown?: unknown
}

export interface ReportRepoConfig {
  repo: string
  branch: string
  group: string
}

export interface ReportConfig {
  token: string
  author: string
  outputDir: string
  repos: ReportRepoConfig[]
}

export interface GitCommitRecord {
  date: string
  author: string
  subject: string
  hash: string
}

export interface ReportRepoResult {
  project: string
  repo: string
  branch: string
  group: string
  logs: GitCommitRecord[]
  error: string
}

export interface GenerateReportInput {
  token: string
  author: string
  since: string
  until: string
  repos: ReportRepoConfig[]
}

export interface GenerateReportResult {
  results: ReportRepoResult[]
  markdown: string
}

const stringValue = (value: unknown) => String(value ?? '')

function normalizeRepo(value: ReportRepoConfigRaw): ReportRepoConfig {
  return {
    repo: stringValue(value.repo),
    branch: stringValue(value.branch),
    group: stringValue(value.group),
  }
}

function normalizeCommit(value: GitCommitRaw): GitCommitRecord {
  return {
    date: stringValue(value.date),
    author: stringValue(value.author),
    subject: stringValue(value.subject),
    hash: stringValue(value.hash),
  }
}

function normalizeResult(value: ReportRepoResultRaw): ReportRepoResult {
  const logs = Array.isArray(value.logs)
    ? value.logs.map((item) => normalizeCommit(item as GitCommitRaw))
    : []

  return {
    project: stringValue(value.project),
    repo: stringValue(value.repo),
    branch: stringValue(value.branch),
    group: stringValue(value.group),
    logs,
    error: stringValue(value.error),
  }
}

export function normalizeReportConfig(value: ReportConfigRaw): ReportConfig {
  const repos = Array.isArray(value.repos)
    ? value.repos.map((item) => normalizeRepo(item as ReportRepoConfigRaw))
    : []

  return {
    token: stringValue(value.token),
    author: stringValue(value.author),
    outputDir: stringValue(value.outputDir),
    repos,
  }
}

export function normalizeGenerateReportResult(value: GenerateReportResponseRaw): GenerateReportResult {
  const results = Array.isArray(value.results)
    ? value.results.map((item) => normalizeResult(item as ReportRepoResultRaw))
    : []

  return {
    results,
    markdown: stringValue(value.markdown),
  }
}

export async function getReportConfig(): Promise<ReportConfig> {
  const value = await apiClient.get<ReportConfigRaw>('/api/report/config')
  return normalizeReportConfig(value)
}

export async function generateGitActivity(input: GenerateReportInput): Promise<GenerateReportResult> {
  const value = await apiClient.post<GenerateReportResponseRaw>('/api/report/generate', input, REPORT_TIMEOUT)
  return normalizeGenerateReportResult(value)
}
