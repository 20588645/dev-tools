/**
 * CodeMirror 5 的最小模块声明：项目刻意不引 @types/codemirror（避免误升 CM6 心智），
 * 实例/文档类型沿用 env.d.ts 里的全局 CodeMirrorStatic / CodeMirrorEditor / CodeMirrorDoc。
 */
declare module 'codemirror' {
  const CodeMirror: CodeMirrorStatic
  export default CodeMirror
}

declare module 'codemirror/addon/*'
declare module 'codemirror/mode/*'
