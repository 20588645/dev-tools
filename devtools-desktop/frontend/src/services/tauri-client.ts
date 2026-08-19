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

  async pickAppBundle(): Promise<string | null> {
    if (!this.available) return null
    const picked = await this.invoke<string | null>('pick_app_bundle')
    const path = typeof picked === 'string' ? picked.trim() : ''
    return path || null
  }

  /**
   * Tauri 会拦截系统文件拖放；桌面端用这条拿到 .app 绝对路径。
   * 浏览器开发模式没有该事件，调用方应同时保留 HTML 拖放兜底。
   */
  async listenDragDrop(
    handler: (event: { type: 'enter' | 'over' | 'drop' | 'leave'; paths?: string[] }) => void,
  ): Promise<() => void> {
    if (!this.available) return () => {}
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      return await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop' || payload.type === 'enter') {
          handler({ type: payload.type, paths: payload.paths })
          return
        }
        handler({ type: payload.type })
      })
    } catch {
      return () => {}
    }
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

  async openExternalUrl(url: string): Promise<void> {
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw new Error('只允许打开 HTTP 或 HTTPS 链接')
    }
    if (this.available) {
      await this.invoke('open_external_url', { url })
      return
    }
    const opened = globalThis.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) throw new Error('浏览器阻止了外部链接')
    opened.opener = null
  }
}

export const tauriClient = new TauriClient()
