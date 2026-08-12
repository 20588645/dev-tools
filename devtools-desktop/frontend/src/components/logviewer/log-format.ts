/**
 * 日志行解析与着色的纯函数集合。
 *
 * 从旧日志渲染链路迁出（原 `appendLog` / `ansiToHtml` / `colorizeAndLinkLog`）。
 * 保持原有分类与匹配规则不变，只把「拼 HTML 字符串」改为「产出结构化片段」，
 * 由 Vue 模板负责渲染与转义，不再手工 escapeHtml。
 */

export type LogLineType = 'cmd' | 'info' | 'success' | 'warn' | 'error'

/** ANSI SGR 颜色码 → Design Token。旧实现里的 magenta/cyan/white 走数据系列色与文本色。 */
const ANSI_COLOR_TOKENS: Record<number, string> = {
  30: 'var(--color-text-muted)',
  31: 'var(--color-danger)',
  32: 'var(--color-success)',
  33: 'var(--color-warning)',
  34: 'var(--color-action)',
  35: 'var(--color-series-2)',
  36: 'var(--color-info)',
  37: 'var(--color-text)',
  90: 'var(--color-text-subtle)',
}

/**
 * 终端控制序列：着色前先剥掉，用于关键字嗅探与搜索匹配。
 * 第二个分支覆盖 ESC 已在上游丢失、只剩 `[32m` 裸序列的情况（Sidecar 的
 * `stripTerminalControl` 也做了同样兜底）。
 */
const ANSI_PATTERN = /\u001B\[[0-9;]*[a-zA-Z]|\[[\d;]*m/g

/**
 * 日志中的源码位置，可点击跳编辑器。
 * 与旧实现同一套正则，含 `file:///`、`at ` 与 `internal/` 前缀形态。
 */
const SOURCE_PATH_PATTERN =
  /(?:^|\s|file:\/\/\/|at\s+|internal\/)([\w.\-_/\\+]+?\.(?:js|ts|jsx|tsx|vue|css|scss|less|html|json)):(\d+)(?::(\d+))?\b/gi

/** HPM 代理报错：dev server 常态噪音，强制降级为 warn，不显示为红色。 */
const HPM_ERROR_PATTERN = /\[HPM\]\s+Error/i

const ERROR_KEYWORDS = /ERROR|Exception|Failed|TypeError|ReferenceError|CompileError|ValidationError/i
const WARN_KEYWORDS = /WARN|Warning|Deprecated|Deprecation/i
const SUCCESS_KEYWORDS = /SUCCESS|Compiled successfully|Listening at/i

export function stripAnsi(text: string): string {
  return String(text ?? '').replace(ANSI_PATTERN, '')
}

/**
 * 推断日志行的显示分类。
 *
 * 仅当上游给的是 `info`（未定性）时才做关键字嗅探；上游已明确 error/warn/success 的
 * 不再改判，避免把 stderr 的正常输出误标。HPM 报错是唯一的强制降级例外。
 */
export function resolveLogLineType(text: string, declared: LogLineType = 'info'): LogLineType {
  const clean = stripAnsi(text)
  if (HPM_ERROR_PATTERN.test(clean)) return 'warn'
  if (declared !== 'info') return declared
  if (ERROR_KEYWORDS.test(clean)) return 'error'
  if (WARN_KEYWORDS.test(clean)) return 'warn'
  if (SUCCESS_KEYWORDS.test(clean)) return 'success'
  return 'info'
}

export interface LogTextSegment {
  kind: 'text'
  text: string
  /** ANSI 前景色对应的 Token，无色时为空。 */
  color: string
  bold: boolean
}

export interface LogLinkSegment {
  kind: 'link'
  /** 展示文本，过长时头部省略。 */
  text: string
  path: string
  line: number
  column: number | null
}

export type LogSegment = LogTextSegment | LogLinkSegment

interface AnsiSpan {
  text: string
  color: string
  bold: boolean
}

/** 解析 ANSI SGR 序列为带样式的文本片段。`0`/`39` 复位颜色，`1`/`22` 切换粗体。 */
function parseAnsiSpans(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = []
  const pattern = /\u001B\[([0-9;]*)m/g
  let cursor = 0
  let color = ''
  let bold = false

  const push = (chunk: string) => {
    if (chunk) spans.push({ text: chunk, color, bold })
  }

  let match = pattern.exec(text)
  while (match !== null) {
    push(text.slice(cursor, match.index))
    cursor = match.index + match[0].length
    for (const rawCode of match[1].split(';')) {
      const code = Number.parseInt(rawCode, 10)
      if (Number.isNaN(code) || code === 0) {
        color = ''
        bold = false
      } else if (code === 39) {
        color = ''
      } else if (code === 1) {
        bold = true
      } else if (code === 22) {
        bold = false
      } else if (ANSI_COLOR_TOKENS[code]) {
        color = ANSI_COLOR_TOKENS[code]
      }
    }
    match = pattern.exec(text)
  }
  push(text.slice(cursor))
  return spans
}

/** 长路径头部省略，与旧实现的 35/32 阈值一致。 */
function shortenPath(path: string): string {
  return path.length > 35 ? `...${path.slice(-32)}` : path
}

/**
 * 在一段纯文本里切出可跳转的源码位置。
 * 含 URL 的行整体跳过——旧实现同样如此，避免把 `http://host:3000/a.js:1` 里的
 * 路径片段误判为本地文件。
 */
function splitSourceLinks(text: string, color: string, bold: boolean): LogSegment[] {
  if (/https?:\/\//i.test(text)) return [{ kind: 'text', text, color, bold }]

  const segments: LogSegment[] = []
  const pattern = new RegExp(SOURCE_PATH_PATTERN.source, SOURCE_PATH_PATTERN.flags)
  let cursor = 0
  let match = pattern.exec(text)

  while (match !== null) {
    const [full, path, line, column] = match
    // 前缀（空白/`at `/`file:///`）不属于链接本体，留在文本片段里。
    const linkStart = match.index + full.indexOf(path)
    if (linkStart > cursor) segments.push({ kind: 'text', text: text.slice(cursor, linkStart), color, bold })
    segments.push({
      kind: 'link',
      text: `${shortenPath(path)}:${column ? `${line}:${column}` : line}`,
      path,
      line: Number.parseInt(line, 10),
      column: column ? Number.parseInt(column, 10) : null,
    })
    cursor = linkStart + full.length - full.indexOf(path)
    match = pattern.exec(text)
  }

  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor), color, bold })
  return segments
}

/** 把一行原始日志拆成可直接渲染的片段序列。 */
export function parseLogLine(text: string): LogSegment[] {
  const segments: LogSegment[] = []
  for (const span of parseAnsiSpans(String(text ?? ''))) {
    segments.push(...splitSourceLinks(span.text, span.color, span.bold))
  }
  return segments.length > 0 ? segments : [{ kind: 'text', text: '', color: '', bold: false }]
}
