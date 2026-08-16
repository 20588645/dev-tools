// 一次性排查脚本：对比原型与实际页面 .quote-mark / .qh-mark 的计算样式
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const PROTO = fileURLToPath(new URL('../design-preview/redesign-v2/app/home.html', import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1665, height: 1184 } })

const read = (selector) => page.$eval(selector, (el) => {
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    fontSize: s.fontSize, opacity: s.opacity, color: s.color,
    fontFamily: s.fontFamily.slice(0, 60), top: s.top, left: s.left,
    rect: { w: Math.round(r.width), h: Math.round(r.height) },
    text: el.textContent,
  }
})

await page.goto(`file://${PROTO}`, { waitUntil: 'load' })
console.log('PROTO .qh-mark', JSON.stringify(await read('.qh-mark'), null, 1))

await page.goto('http://127.0.0.1:1420/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
console.log('APP .quote-mark', JSON.stringify(await read('.quote-mark'), null, 1))

await browser.close()
