/// <reference types="vite/client" />

declare global {
  /** CM5 最小类型（配 views/editor/codemirror.d.ts 的模块声明）；不引 @types/codemirror，避免误升 CM6。 */
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
