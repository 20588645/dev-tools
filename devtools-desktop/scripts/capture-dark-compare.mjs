// 一次性脚本：暗色主题下原型 vs 实际成对截图（卡片分组三页打磨用）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../design-preview/screenshots/proto-vs-app/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const pages = [
  { name: 'run', proto: 'run.html', app: '#/run' },
  { name: 'deploy-dashboard', proto: 'deploy-dashboard.html', app: '#/deploy/dashboard' },
  { name: 'twofa', proto: 'twofa.html', app: '#/twofa' },
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1665, height: 1184 }, colorScheme: 'dark' })

for (const target of pages) {
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:4173/${target.proto}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${target.name}-proto-dark.png` })
  await page.goto(`http://127.0.0.1:1420/${target.app}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}${target.name}-app-dark.png` })
  await page.close()
  console.log(`captured ${target.name} dark`)
}

await browser.close()
