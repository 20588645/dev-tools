import { spawnSync } from 'node:child_process'
import path from 'node:path'

const maximumDuplicateSelectorErrors = new Map([
  ['src/css/base.css', 3],
  // 删除 report/notes 选择器后，原先带额外页面选择器的规则组收缩为相同选择器，
  // Stylelint 会将这些既有层叠规则识别为重复；数量随旧 CSS 后续迁移继续下降。
  ['src/css/components.css', 8],
  ['src/css/layout.css', 4],
  // 服务器管理子页迁移时这两个文件曾各 +1（.history-table/.history-row 从混合组
  // 收缩为同名规则）；部署历史子页迁完、整批 .history-* 规则删除后已回落原值。
  ['src/css/overrides.css', 4],
  ['src/css/pages/deploy.css', 2],
  ['src/css/legacy-runtime.css', 4],
])

const stylelintBin = path.resolve('node_modules/.bin/stylelint')
const result = spawnSync(stylelintBin, ['src/css/**/*.css', '--formatter', 'json'], {
  encoding: 'utf8',
  shell: false,
})

const jsonOutput = result.stdout.trim() || result.stderr.trim()

if (!jsonOutput) {
  process.stderr.write('Stylelint 没有返回结果\n')
  process.exit(1)
}

const reports = JSON.parse(jsonOutput)
const counts = new Map()
const unexpected = []

for (const report of reports) {
  const file = path.relative(process.cwd(), report.source).split(path.sep).join('/')
  for (const warning of report.warnings) {
    if (warning.severity !== 'error') continue
    if (warning.rule !== 'no-duplicate-selectors') {
      unexpected.push(`${file}:${warning.line} ${warning.rule}`)
      continue
    }
    counts.set(file, (counts.get(file) || 0) + 1)
  }
}

for (const [file, count] of counts) {
  const maximum = maximumDuplicateSelectorErrors.get(file)
  if (maximum === undefined || count > maximum) {
    unexpected.push(`${file}: duplicate selector ${count}, baseline maximum ${maximum ?? 0}`)
  }
}

if (unexpected.length) {
  console.error('旧 CSS 出现了基线之外的新 Stylelint 错误：')
  unexpected.forEach(item => console.error(`- ${item}`))
  process.exit(1)
}

const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
console.log(`旧 CSS 基线通过：${total} 个已登记重复选择器错误，没有新增 Stylelint 错误。`)
