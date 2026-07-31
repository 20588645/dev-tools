import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const viewsRoot = join(projectRoot, 'frontend', 'src', 'views')
const baselinePath = join(projectRoot, 'scripts', 'component-architecture-baseline.json')
const sourceExtensions = new Set(['.vue', '.css', '.ts'])

export const ruleDescriptions = {
  'third-party-ui-import': '业务页面直接导入第三方 UI 库',
  'naive-internal-selector': '页面样式引用 Naive UI 内部 .n-* 类',
  'deep-selector': '业务页面使用 :deep() 穿透组件内部结构',
  'native-control': '页面重新实现原生 button/input/select/textarea',
  'native-table': '页面新增原生 table 数据表格',
  'direct-interval': '页面直接使用 setInterval',
  'view-network-or-ipc': 'View 直接执行网络、Tauri IPC 或原始 WebSocket',
  'document-query': '页面直接使用 document 查询 DOM',
}

function posixPath(path) {
  return path.split(sep).join('/')
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (sourceExtensions.has(extname(entry.name)) && !entry.name.includes('.test.')) files.push(path)
  }
  return files
}

function lineAndColumn(source, offset) {
  const before = source.slice(0, offset)
  const lines = before.split('\n')
  return { line: lines.length, column: lines.at(-1).length + 1 }
}

function templateSource(source) {
  const templateStart = source.indexOf('<template')
  if (templateStart < 0) return null
  const contentStart = source.indexOf('>', templateStart)
  const contentEnd = source.lastIndexOf('</template>')
  if (contentStart < 0 || contentEnd <= contentStart) return null
  return {
    source: source.slice(contentStart + 1, contentEnd),
    offset: contentStart + 1,
  }
}

export function inspectSource(file, source) {
  const extension = extname(file)
  const findings = []
  const add = (rule, matches, locationSource = source, lineOffset = 0) => {
    for (const match of matches) {
      const location = lineAndColumn(locationSource, match.index ?? 0)
      findings.push({
        rule,
        file,
        line: location.line + lineOffset,
        column: location.column,
        text: match[0],
      })
    }
  }

  if (extension === '.vue' || extension === '.ts') {
    add(
      'third-party-ui-import',
      [...source.matchAll(/\bfrom\s+['"](?:naive-ui|element-plus)['"]|\bimport\s*\(\s*['"](?:naive-ui|element-plus)['"]\s*\)/gu)],
    )
    add('direct-interval', [...source.matchAll(/\b(?:globalThis\.)?setInterval\s*\(/gu)])
    add(
      'view-network-or-ipc',
      [...source.matchAll(/\bfetch\s*\(|window\.__TAURI__|\bnew\s+WebSocket\s*\(/gu)],
    )
    add(
      'document-query',
      [...source.matchAll(/\bdocument\.(?:querySelector(?:All)?|getElementById)\s*(?:<[^>]+>)?\s*\(/gu)],
    )
  }

  if (extension === '.vue' || extension === '.css') {
    add('naive-internal-selector', [...source.matchAll(/\.n-[a-zA-Z0-9_-]+/gu)])
    add('deep-selector', [...source.matchAll(/:deep\s*\(/gu)])
  }

  if (extension === '.vue') {
    const template = templateSource(source)
    if (template) {
      const templateLineOffset = source.slice(0, template.offset).split('\n').length - 1
      add(
        'native-control',
        [...template.source.matchAll(/<(?:button|input|select|textarea)\b/gu)],
        template.source,
        templateLineOffset,
      )
      add(
        'native-table',
        [...template.source.matchAll(/<table\b/gu)],
        template.source,
        templateLineOffset,
      )
    }
  }

  return findings
}

export function countFindings(findings) {
  const counts = {}
  for (const rule of Object.keys(ruleDescriptions)) counts[rule] = {}
  for (const finding of findings) {
    counts[finding.rule][finding.file] = (counts[finding.rule][finding.file] || 0) + 1
  }
  return counts
}

function validateExceptions(exceptions) {
  const errors = []
  for (const [index, exception] of exceptions.entries()) {
    if (!ruleDescriptions[exception.rule]) errors.push(`exceptions[${index}] 使用未知规则 ${exception.rule}`)
    if (typeof exception.file !== 'string' || !exception.file.startsWith('frontend/src/views/')) {
      errors.push(`exceptions[${index}] 必须提供业务页面精确路径`)
    }
    if (!Number.isInteger(exception.count) || exception.count < 1) {
      errors.push(`exceptions[${index}] count 必须是正整数`)
    }
    if (typeof exception.reason !== 'string' || exception.reason.trim().length < 12) {
      errors.push(`exceptions[${index}] 必须提供不少于 12 个字符的具体理由`)
    }
  }
  return errors
}

function validateBaseline(baseline) {
  const errors = []
  for (const rule of Object.keys(ruleDescriptions)) {
    if (!Object.hasOwn(baseline, rule)) errors.push(`baseline 缺少规则 ${rule}，零基线也必须显式登记`)
  }
  for (const [rule, files] of Object.entries(baseline)) {
    if (!ruleDescriptions[rule]) {
      errors.push(`baseline 使用未知规则 ${rule}`)
      continue
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      errors.push(`baseline.${rule} 必须是文件到数量的对象`)
      continue
    }
    for (const [file, count] of Object.entries(files)) {
      if (!file.startsWith('frontend/src/views/')) {
        errors.push(`baseline.${rule} 使用了业务页面范围外路径 ${file}`)
      }
      if (!Number.isInteger(count) || count < 1) {
        errors.push(`baseline.${rule}.${file} 必须是正整数`)
      }
    }
  }
  return errors
}

function subtractExceptions(counts, exceptions) {
  const result = structuredClone(counts)
  const errors = []
  for (const exception of exceptions) {
    const current = result[exception.rule]?.[exception.file] || 0
    if (current < exception.count) {
      errors.push(`${exception.rule} ${exception.file} 的例外数量 ${exception.count} 超过当前发现 ${current}`)
      continue
    }
    const remaining = current - exception.count
    if (remaining === 0) delete result[exception.rule][exception.file]
    else result[exception.rule][exception.file] = remaining
  }
  return { counts: result, errors }
}

export function compareBaseline(current, baseline) {
  const errors = []
  for (const rule of Object.keys(ruleDescriptions)) {
    const currentFiles = current[rule] || {}
    const baselineFiles = baseline[rule] || {}
    const files = new Set([...Object.keys(currentFiles), ...Object.keys(baselineFiles)])
    for (const file of [...files].sort()) {
      const actual = currentFiles[file] || 0
      const expected = baselineFiles[file] || 0
      if (actual > expected) {
        errors.push(`${rule} ${file}: 当前 ${actual}，基线 ${expected}，禁止新增或转移违规`)
      } else if (actual < expected) {
        errors.push(`${rule} ${file}: 当前 ${actual}，基线 ${expected}，已减少违规但未同步下调基线`)
      }
    }
  }
  return errors
}

function totalCounts(counts) {
  return Object.values(counts).reduce(
    (total, files) => total + Object.values(files).reduce((sum, count) => sum + count, 0),
    0,
  )
}

async function main() {
  const config = JSON.parse(await readFile(baselinePath, 'utf8'))
  if (config.version !== 1 || config.policy !== 'ratchet') {
    throw new Error('组件架构基线版本或策略无效')
  }

  const files = await walk(viewsRoot)
  const findings = []
  for (const absoluteFile of files) {
    const file = posixPath(relative(projectRoot, absoluteFile))
    const source = await readFile(absoluteFile, 'utf8')
    findings.push(...inspectSource(file, source))
  }

  const baselineErrors = validateBaseline(config.baseline || {})
  const exceptionErrors = validateExceptions(config.exceptions || [])
  const validatedExceptions = exceptionErrors.length === 0 ? (config.exceptions || []) : []
  const currentWithExceptions = subtractExceptions(countFindings(findings), validatedExceptions)
  const errors = [
    ...baselineErrors,
    ...exceptionErrors,
    ...currentWithExceptions.errors,
    ...compareBaseline(currentWithExceptions.counts, config.baseline || {}),
  ]

  if (process.argv.includes('--details')) {
    for (const finding of findings) {
      console.log(`${finding.rule} ${finding.file}:${finding.line}:${finding.column} ${finding.text}`)
    }
  }

  if (errors.length > 0) {
    console.error('组件架构门禁失败：')
    errors.forEach(error => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  const debt = totalCounts(currentWithExceptions.counts)
  const exceptionCount = (config.exceptions || []).reduce((sum, item) => sum + item.count, 0)
  console.log(`组件架构门禁通过：没有新增或转移违规；存量基线 ${debt} 项，批准例外 ${exceptionCount} 项。`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
