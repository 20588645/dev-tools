// 一次性脚本：同尺寸抓取「冻结原型页 vs 实际应用页」成对截图，供逐页逐细节对比。
// 原型走 file://（静态 HTML），应用走 dev server（真实 sidecar 数据）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = new URL('../design-preview/screenshots/proto-compare/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const PROTO_ROOT = fileURLToPath(new URL('../design-preview/redesign-v2/app/', import.meta.url))

const pages = [
  ['home', 'home.html', '#/'],
  ['run', 'run.html', '#/run'],
  ['deploy-dashboard', 'deploy-dashboard.html', '#/deploy/dashboard'],
  ['deploy-servers', 'deploy-servers.html', '#/deploy/servers'],
  ['deploy-history', 'deploy-history.html', '#/deploy/history'],
  ['filetransfer', 'filetransfer.html', '#/filetransfer'],
  ['editor', 'editor.html', '#/editor'],
  ['terminal', 'terminal.html', '#/terminal'],
  ['todo', 'todo.html', '#/todo'],
  ['notes', 'notes.html', '#/notes'],
  ['notebook', 'notebook.html', '#/notebook'],
  ['ipcheck', 'ipcheck.html', '#/ipcheck'],
  ['twofa', 'twofa.html', '#/twofa'],
  ['usage', 'usage.html', '#/usage'],
  ['settings', 'settings.html', '#/settings'],
]

const size = { width: 1665, height: 1184 }
const browser = await chromium.launch()

for (const [name, protoFile, appHash] of pages) {
  const context = await browser.newContext({ viewport: size, colorScheme: 'light' })
  const page = await context.newPage()

  await page.goto(`file://${PROTO_ROOT}${protoFile}`, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.setItem('proto-theme', 'light'))
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}-proto.png` })

  await page.goto(`http://127.0.0.1:1420/${appHash}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}${name}-app.png` })

  await context.close()
  console.log(`captured ${name}`)
}

await browser.close()
