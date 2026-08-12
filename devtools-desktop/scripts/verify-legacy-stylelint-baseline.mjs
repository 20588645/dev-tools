import { spawnSync } from 'node:child_process'
import path from 'node:path'

// P9-7：旧 CSS 已自仓库 src/css 吸收进 frontend/src/styles/legacy（活规则保留、
// 死规则删除），基线路径与数量随之更新；G7 目标是该目录随全面 token 化归零。
const maximumDuplicateSelectorErrors = new Map([
  ['frontend/src/styles/legacy/base.css', 3],
  ['frontend/src/styles/legacy/components.css', 5],
  ['frontend/src/styles/legacy/layout.css', 4],
])

const stylelintBin = path.resolve('node_modules/.bin/stylelint')
const result = spawnSync(stylelintBin, ['frontend/src/styles/legacy/**/*.css', '--formatter', 'json'], {
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
