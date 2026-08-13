// 一次性脚本：抓取批 1 页面重设计的亮/暗 × 双尺寸截图，供验收抽验。
// 用法：node scripts/capture-batch1-home.mjs [pageName pageHash]...（缺省抓 home #/）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../design-preview/screenshots/redesign-v2-batch1/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const args = process.argv.slice(2)
const pages = []
for (let i = 0; i + 1 < args.length; i += 2) pages.push({ name: args[i], hash: args[i + 1] })
if (pages.length === 0) pages.push({ name: 'home', hash: '#/' })

const sizes = [
  { width: 1665, height: 1184 },
  { width: 900, height: 600 },
]
const themes = ['light', 'dark']

const browser = await chromium.launch()
for (const target of pages) {
  for (const theme of themes) {
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size, colorScheme: theme })
      const page = await context.newPage()
      await page.goto(`http://127.0.0.1:1420/${target.hash}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${OUT}${target.name}-${theme}-${size.width}x${size.height}.png` })
      await context.close()
      console.log(`captured ${target.name}-${theme}-${size.width}x${size.height}.png`)
    }
  }
}
await browser.close()
