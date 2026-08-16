import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = join(projectRoot, 'frontend', 'src')
const sourceExtensions = new Set(['.vue'])

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

/**
 * 弹窗尺寸契约：宽度只允许 720 / 400 两档，日志必须走 LogViewer 的 log 档。
 * 禁止页面再写 width / body-max-height / 自制 <pre> 日志盒。
 */
export function inspectDialogContract(file, source) {
  const findings = []
  const add = (rule, match) => {
    const location = lineAndColumn(source, match.index ?? 0)
    findings.push({
      rule,
      file,
      line: location.line,
      column: location.column,
      text: match[0].replace(/\s+/g, ' ').slice(0, 120),
    })
  }

  const tags = source.matchAll(/<BaseDialog\b[\s\S]*?>/g)
  for (const tag of tags) {
    const text = tag[0]
    if (/\bwidth\s*=/.test(text)) add('dialog-width-override', tag)
    if (/\bbody-max-height\s*=/.test(text)) add('dialog-body-max-override', tag)
    if (/\bbody-height\s*=/.test(text)) add('dialog-body-height-override', tag)
  }

  if (file !== 'frontend/src/components/feedback/BaseDialog.vue') {
    const naiveModal = source.match(/\bimport\s*\{[^}]*\bNModal\b|<NModal\b|<n-modal\b/)
    if (naiveModal) add('homemade-nmodal', naiveModal)
  }

  const nativeDialog = source.match(/<dialog\b/)
  if (nativeDialog) add('native-dialog-element', nativeDialog)

  if (/Dialog\.vue$/.test(file) && /<pre\b/.test(source)) {
    const match = source.match(/<pre\b/)
    if (match) add('dialog-custom-log-pre', match)
  }

  return findings
}

async function main() {
  const files = await walk(sourceRoot)
  const findings = []
  for (const absoluteFile of files) {
    const file = posixPath(relative(projectRoot, absoluteFile))
    const source = await readFile(absoluteFile, 'utf8')
    findings.push(...inspectDialogContract(file, source))
  }

  if (findings.length > 0) {
    console.error('弹窗尺寸契约失败：页面不得私自改宽高，日志弹窗必须复用 LogViewer。')
    for (const finding of findings) {
      console.error(`- ${finding.rule} ${finding.file}:${finding.line} ${finding.text}`)
    }
    process.exitCode = 1
    return
  }

  console.log('弹窗尺寸契约通过：没有私自覆盖宽高，也没有自制日志弹窗。')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
