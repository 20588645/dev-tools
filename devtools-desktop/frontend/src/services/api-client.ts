import { tauriClient } from './tauri-client'

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response' | 'configuration'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly details?: unknown

  constructor(message: string, kind: ApiErrorKind, options: { status?: number; details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.details = options.details
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeout?: number
}

export interface ApiClientOptions {
  defaultPort?: number
  defaultTimeout?: number
  fetcher?: typeof fetch
}

const DEFAULT_PORT = 13456
const DEFAULT_TIMEOUT = 15_000

function normalizeError(error: unknown, timeout: number): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('请求超时，请检查 Sidecar 状态', 'timeout', { cause: error })
  }
  if (error instanceof TypeError) {
    return new ApiError('无法连接 Sidecar 服务', 'network', { cause: error })
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiError(`请求超时（${timeout}ms），请检查 Sidecar 状态`, 'timeout', { cause: error })
  }
  return new ApiError(error instanceof Error ? error.message : '请求失败', 'network', { cause: error })
}

function parseResponseBody(text: string, contentType: string | null): unknown {
  if (!text) return undefined
  if (contentType?.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new ApiError('Sidecar 返回了无效 JSON', 'invalid-response', { cause: error })
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class ApiClient {
  private readonly defaultPort: number
  private readonly defaultTimeout: number
  private readonly fetcher: typeof fetch
  private baseUrl = ''
  private initialization: Promise<string> | null = null

  constructor(options: ApiClientOptions = {}) {
    this.defaultPort = options.defaultPort ?? DEFAULT_PORT
    this.defaultTimeout = options.defaultTimeout ?? DEFAULT_TIMEOUT
    this.fetcher = options.fetcher ?? fetch
  }

  get baseURL() {
    return this.baseUrl
  }

  async initialize(): Promise<string> {
    if (this.baseUrl) return this.baseUrl
    if (!this.initialization) {
      this.initialization = this.resolveBaseUrl().finally(() => {
        this.initialization = null
      })
    }
    this.baseUrl = await this.initialization
    return this.baseUrl
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const baseUrl = await this.initialize()
    const timeout = options.timeout ?? this.defaultTimeout
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => controller.abort(), timeout)
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const response = await this.fetcher(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      })
      const text = await response.text()
      const body = parseResponseBody(text, response.headers.get('content-type'))
      if (!response.ok) {
        const message = typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : response.statusText || `请求失败（${response.status}）`
        throw new ApiError(message, 'http', { status: response.status, details: body })
      }
      return body as T
    } catch (error) {
      throw normalizeError(error, timeout)
    } finally {
      globalThis.clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  get<T>(path: string, timeout?: number) {
    return this.request<T>(path, { timeout })
  }

  post<T>(path: string, body?: unknown, timeout?: number) {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout,
    })
  }

  put<T>(path: string, body?: unknown, timeout?: number) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout,
    })
  }

  delete<T>(path: string, body?: unknown, timeout?: number) {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout,
    })
  }

  private async resolveBaseUrl() {
    const tauriPort = await tauriClient.getSidecarPort().catch(() => null)
    if (tauriPort) return `http://127.0.0.1:${tauriPort}`

    const search = typeof globalThis.location === 'object' ? globalThis.location.search : ''
    const devPort = new URLSearchParams(search).get('apiPort')
    const port = devPort && /^\d+$/.test(devPort) ? Number(devPort) : this.defaultPort
    if (!port || port < 1 || port > 65_535) {
      throw new ApiError('Sidecar 端口配置无效', 'configuration')
    }
    return `http://127.0.0.1:${port}`
  }
}

export const apiClient = new ApiClient()
