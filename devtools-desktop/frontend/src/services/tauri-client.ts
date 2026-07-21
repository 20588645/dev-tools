/**
 * Tauri IPC 边界。
 *
 * 页面和 store 不应直接判断 window.__TAURI__，浏览器开发模式统一通过
 * `tauriClient` 的显式 fallback 处理。
 */

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

interface TauriWindowShape {
  __TAURI__?: {
    core?: { invoke?: Invoke }
    invoke?: Invoke
  }
  __TAURI_INTERNALS__?: { invoke?: Invoke }
}

export interface RunningProject {
  name: string
  port?: number
  url?: string
  status?: string
}

function resolveInvoke(): Invoke | null {
  const tauri = globalThis as typeof globalThis & TauriWindowShape
  return tauri.__TAURI__?.core?.invoke
    ?? tauri.__TAURI__?.invoke
    ?? tauri.__TAURI_INTERNALS__?.invoke
    ?? null
}

export class TauriClient {
  get available() {
    return resolveInvoke() !== null
  }

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const invoke = resolveInvoke()
    if (!invoke) {
      throw new Error(`Tauri IPC 不可用：${command}`)
    }
    return invoke(command, args) as Promise<T>
  }

  async getSidecarPort(): Promise<number | null> {
    if (!this.available) return null
    return this.invoke<number>('get_sidecar_port')
  }

  async restartSidecar(): Promise<number> {
    return this.invoke<number>('restart_sidecar')
  }

  async updateTrayMenu(projects: RunningProject[]): Promise<void> {
    await this.invoke('update_tray_menu', { projects })
  }

  async exitApp(): Promise<void> {
    await this.invoke('exit_app')
  }
}

export const tauriClient = new TauriClient()
