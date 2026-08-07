import { spawnSync } from 'node:child_process'
import path from 'node:path'

const maximumDuplicateSelectorErrors = new Map([
  ['src/css/base.css', 3],
  // 删除 report/notes 选择器后，原先带额外页面选择器的规则组收缩为相同选择器，
  // Stylelint 会将这些既有层叠规则识别为重复；数量随旧 CSS 后续迁移继续下降。
  ['src/css/components.css', 8],
  ['src/css/layout.css', 4],
  // 服务器管理子页迁移后删除 .server-*/.path-tag 选择器，同样出现上述收缩：
  // overrides 的 .history-table/.history-row、deploy 的 .history-row 从混合组
  // 变成同名规则。这些是顺序敏感的 !important 层叠（如 .history-table 的
  // border-radius 由 6 条同权规则按源序决出 8px），合并会改变层叠结果且零收益，
  // 故只登记数量；等部署历史子页迁完这批规则会整体消失。
  ['src/css/overrides.css', 6],
  ['src/css/pages/deploy.css', 3],
  ['src/css/legacy-runtime.css', 5],
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
