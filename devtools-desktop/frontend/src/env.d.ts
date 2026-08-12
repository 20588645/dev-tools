/// <reference types="vite/client" />

import type { App as VueApp } from 'vue'
import type { Pinia } from 'pinia'

interface MigrationRuntime {
  readonly pinia: Pinia
  readonly app: VueApp<Element> | null
  readonly deferred: boolean
  mount: (root?: Element | null) => VueApp<Element> | null
}

/** 迁移期仍由旧 `src/js/*.js` / main.ts 提供的全局。P9-4 起 `app.js` 已删。 */
interface LegacyGlobals {
  /**
   * Vue Toast 桥：由 `main.ts` 安装。
   * 签名兼容旧 `showToast(title, message, options)`。
   */
  __devtoolsShowToast?: (
    title: string,
    message?: string,
    options?: { clickable?: boolean; persistent?: boolean },
  ) => void
  showToast?: (
    title: string,
    message?: string,
    options?: { clickable?: boolean; persistent?: boolean },
  ) => void
}

declare global {
  interface Window extends LegacyGlobals {
    __DEVTOOLS_MIGRATION__?: MigrationRuntime
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
