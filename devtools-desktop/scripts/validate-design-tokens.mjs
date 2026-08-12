import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../frontend/src/', import.meta.url))
const tokenRoots = [join(root, 'styles', 'tokens'), join(root, 'styles', 'themes')]
const sourceExtensions = new Set(['.vue', '.css', '.ts'])
const colorPattern = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (sourceExtensions.has(extname(entry.name))) files.push(path)
  }
  return files
}

const violations = []
for (const file of await walk(root)) {
  if (tokenRoots.some((allowedRoot) => file.startsWith(allowedRoot))) continue
  const source = await readFile(file, 'utf8')
  for (const [index, line] of source.split('\n').entries()) {
    if (colorPattern.test(line)) {
      colorPattern.lastIndex = 0
      violations.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`)
    }
  }
}

if (violations.length > 0) {
  console.error('发现未登记的硬编码颜色，请改用 Design Token：')
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log('Design Token 校验通过：第一方源码没有未登记的硬编码颜色。')
}
