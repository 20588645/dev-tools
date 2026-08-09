/// <reference types="vite/client" />

import type { App as VueApp } from 'vue'
import type { Pinia } from 'pinia'

interface MigrationRuntime {
  readonly pinia: Pinia
  readonly app: VueApp<Element> | null
  readonly deferred: boolean
  mount: (root?: Element | null) => VueApp<Element> | null
}

/** 迁移期仍由旧 `src/js/*.js` 提供的全局函数。各页迁移完成后逐个收敛。 */
interface LegacyGlobals {
  showToast?: (
    title: string,
    message?: string,
    options?: { clickable?: boolean; persistent?: boolean },
  ) => void
  /** 拉起编辑器并定位到行；由 `app.js` 提供，供 LogViewer 的源码链接调用。 */
  openFileInEditorByPath?: (path: string, line: number, projectName?: string) => Promise<void> | void
  /**
   * 桌面通知。仍由 `app.js` 提供：内含权限申请、Tauri/Web 双通道与「点通知回到
   * 日志」的待办记账，整套尚未迁入 Vue。
   */
  sendDesktopNotification?: (
    title: string,
    body: string,
    isSuccess: boolean,
    options?: { target?: string; force?: boolean },
  ) => Promise<void> | void
}

declare global {
  interface Window extends LegacyGlobals {
    __DEVTOOLS_MIGRATION__?: MigrationRuntime
  }
}

export {}
