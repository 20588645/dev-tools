// 一次性脚本：抓取工时内容页打开「Git 活动参考」侧栏后的布局截图（批 3 抽验用）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../design-preview/screenshots/redesign-v2-batch1/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1665, height: 1184 }, colorScheme: theme })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:1420/#/notes', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Git 活动参考', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}notes-reference-${theme}-1665x1184.png` })
  await context.close()
  console.log(`captured notes-reference-${theme}-1665x1184.png`)
}
await browser.close()
