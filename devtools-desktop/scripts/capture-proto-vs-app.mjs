// 全量成对截图：15 页 × 原型/实际 × 亮/暗，供逐页与跨页对照。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../design-preview/screenshots/proto-vs-app/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const pages = [
  { name: 'home', proto: 'home.html', app: '#/' },
  { name: 'run', proto: 'run.html', app: '#/run' },
  { name: 'deploy-dashboard', proto: 'deploy-dashboard.html', app: '#/deploy/dashboard' },
  { name: 'deploy-servers', proto: 'deploy-servers.html', app: '#/deploy/servers' },
  { name: 'deploy-history', proto: 'deploy-history.html', app: '#/deploy/history' },
  { name: 'filetransfer', proto: 'filetransfer.html', app: '#/filetransfer' },
  { name: 'editor', proto: 'editor.html', app: '#/editor' },
  { name: 'terminal', proto: 'terminal.html', app: '#/terminal' },
  { name: 'todo', proto: 'todo.html', app: '#/todo' },
  { name: 'notes', proto: 'notes.html', app: '#/notes' },
  { name: 'notebook', proto: 'notebook.html', app: '#/notebook' },
  { name: 'ipcheck', proto: 'ipcheck.html', app: '#/ipcheck' },
  { name: 'twofa', proto: 'twofa.html', app: '#/twofa' },
  { name: 'usage', proto: 'usage.html', app: '#/usage' },
  { name: 'settings', proto: 'settings.html', app: '#/settings' },
]

const browser = await chromium.launch()

async function capture(theme) {
  const context = await browser.newContext({
    viewport: { width: 1665, height: 1184 },
    colorScheme: theme,
  })
  const page = await context.newPage()
  const suffix = theme === 'dark' ? '-dark' : ''

  for (const target of pages) {
    await page.goto(`http://127.0.0.1:4173/${target.proto}`, { waitUntil: 'networkidle' })
    await page.evaluate((nextTheme) => {
      document.documentElement.setAttribute('data-theme', nextTheme)
      localStorage.setItem('proto-theme', nextTheme)
    }, theme)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}${target.name}-proto${suffix}.png` })

    await page.goto(`http://127.0.0.1:1420/${target.app}`, { waitUntil: 'networkidle' })
    await page.evaluate((nextTheme) => {
      document.body.setAttribute('data-theme-mode', nextTheme)
      document.body.setAttribute('data-theme', nextTheme)
    }, theme)
    await page.waitForTimeout(1400)
    await page.screenshot({ path: `${OUT}${target.name}-app${suffix}.png` })
    console.log(`captured ${target.name}${suffix}`)
  }

  await context.close()
}

await capture('light')
await capture('dark')
await browser.close()
