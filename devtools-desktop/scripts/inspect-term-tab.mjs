// 一次性排查脚本：检查终端活跃标签的计算样式
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1665, height: 1184 } })
await page.goto('http://127.0.0.1:1420/#/terminal', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const tabs = await page.$$eval('.term-tab', (els) => els.map((el) => ({
  cls: el.className,
  bg: getComputedStyle(el).backgroundColor,
  color: getComputedStyle(el).color,
  ariaSelected: el.getAttribute('aria-selected'),
})))
console.log(JSON.stringify(tabs, null, 1))
await browser.close()
