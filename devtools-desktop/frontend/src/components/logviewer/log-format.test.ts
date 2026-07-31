import { describe, expect, it } from 'vitest'

import { parseLogLine, resolveLogLineType, stripAnsi, type LogLinkSegment } from './log-format'

const ESC = '\u001B'

describe('stripAnsi', () => {
  it('剥掉带 ESC 的 SGR 序列', () => {
    expect(stripAnsi(`${ESC}[32mok${ESC}[0m`)).toBe('ok')
  })

  it('剥掉 ESC 已丢失的裸序列', () => {
    expect(stripAnsi('[32mok[0m')).toBe('ok')
  })

  it('空值安全', () => {
    expect(stripAnsi('')).toBe('')
  })
})

describe('resolveLogLineType', () => {
  it('未定性行按关键字嗅探', () => {
    expect(resolveLogLineType('TypeError: x is not a function')).toBe('error')
    expect(resolveLogLineType('warning: deprecated api')).toBe('warn')
    expect(resolveLogLineType('Compiled successfully')).toBe('success')
    expect(resolveLogLineType('just a line')).toBe('info')
  })

  it('上游已定性时不改判', () => {
    // stderr 的正常输出常含 ERROR 字样，但上游已标 info 之外的类型时应尊重。
    expect(resolveLogLineType('ERROR in build', 'success')).toBe('success')
    expect(resolveLogLineType('plain', 'error')).toBe('error')
  })

  it('HPM 代理报错强制降级为 warn', () => {
    expect(resolveLogLineType('[HPM] Error occurred while proxying', 'error')).toBe('warn')
    expect(resolveLogLineType('[HPM] Error occurred', 'info')).toBe('warn')
  })

  it('嗅探基于剥离控制符后的文本', () => {
    expect(resolveLogLineType(`${ESC}[31mFailed to compile${ESC}[0m`)).toBe('error')
  })
})

describe('parseLogLine', () => {
  it('把 ANSI 颜色转成 Token 片段', () => {
    const segments = parseLogLine(`${ESC}[32mdone${ESC}[0mrest`)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ kind: 'text', text: 'done', color: 'var(--color-success)' })
    expect(segments[1]).toMatchObject({ kind: 'text', text: 'rest', color: '' })
  })

  it('支持粗体开关', () => {
    const segments = parseLogLine(`${ESC}[1mbold${ESC}[22mplain`)
    expect(segments[0]).toMatchObject({ text: 'bold', bold: true })
    expect(segments[1]).toMatchObject({ text: 'plain', bold: false })
  })

  it('切出源码位置为链接片段', () => {
    const segments = parseLogLine('ERROR in ./src/main.js:12:5')
    const link = segments.find((segment): segment is LogLinkSegment => segment.kind === 'link')
    expect(link).toBeDefined()
    expect(link).toMatchObject({ path: './src/main.js', line: 12, column: 5 })
  })

  it('无列号时 column 为 null', () => {
    const segments = parseLogLine('at src/utils/foo.ts:42')
    const link = segments.find((segment): segment is LogLinkSegment => segment.kind === 'link')
    expect(link).toMatchObject({ path: 'src/utils/foo.ts', line: 42, column: null })
  })

  it('长路径头部省略但保留完整 path', () => {
    const longPath = 'src/a/very/deeply/nested/directory/structure/component.vue'
    const segments = parseLogLine(`at ${longPath}:9`)
    const link = segments.find((segment): segment is LogLinkSegment => segment.kind === 'link')
    expect(link?.path).toBe(longPath)
    expect(link?.text.startsWith('...')).toBe(true)
  })

  it('含 URL 的行不切链接，避免把 URL 里的路径误判为本地文件', () => {
    const segments = parseLogLine('  ➜  Local: http://localhost:8080/src/main.js:1')
    expect(segments.every((segment) => segment.kind === 'text')).toBe(true)
  })

  it('保留链接前缀文本', () => {
    const segments = parseLogLine('ERROR in ./src/main.js:12:5')
    expect(segments[0]).toMatchObject({ kind: 'text', text: 'ERROR in ' })
  })

  it('空行产出单个空片段，保证 v-for 有内容占位', () => {
    expect(parseLogLine('')).toEqual([{ kind: 'text', text: '', color: '', bold: false }])
  })
})
