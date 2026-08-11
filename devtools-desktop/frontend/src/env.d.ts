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
    /** 由 Vue legacy-bridge 安装；`app.js` switchPage 在切页前 await 此函数。 */
    __devtoolsRunPageLeaveGuards?: (pageId: string) => boolean | Promise<boolean>
    /** CodeMirror 5 由 vendor bundle 以全局脚本注入。 */
    CodeMirror?: CodeMirrorStatic
  }

  /** 仅迁移期用到的 CM5 最小类型；不引入 @types/codemirror，避免误升 CM6。 */
  interface CodeMirrorDoc {
    getValue(): string
    setValue(content: string): void
    changeGeneration(closeEvent?: boolean): number
    isClean(generation?: number): boolean
  }

  interface CodeMirrorEditor {
    getWrapperElement(): HTMLElement
    getDoc(): CodeMirrorDoc
    swapDoc(doc: CodeMirrorDoc): CodeMirrorDoc
    setOption(option: string, value: unknown): void
    getOption(option: string): unknown
    getCursor(): { line: number; ch: number }
    focus(): void
    refresh(): void
    somethingSelected(): boolean
    indentSelection(how: string): void
    replaceSelection(replacement: string, select?: string): void
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
    toTextArea?(): void
  }

  interface CodeMirrorStatic {
    (host: HTMLElement, options?: Record<string, unknown>): CodeMirrorEditor
    Doc: new (text?: string, mode?: string | null, firstLineNumber?: number) => CodeMirrorDoc
  }
}

export {}
