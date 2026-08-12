import { expect, test, type Page } from '@playwright/test'

const pageIds = [
  'home', 'run', 'deploy', 'filetransfer', 'terminal', 'todo', 'notes',
  'notebook', 'editor', 'ipcheck', 'twofa', 'usage', 'settings',
] as const

const pageHash: Record<(typeof pageIds)[number], string> = {
  home: '#/',
  run: '#/run',
  deploy: '#/deploy',
  filetransfer: '#/filetransfer',
  terminal: '#/terminal',
  todo: '#/todo',
  notes: '#/notes',
  notebook: '#/notebook',
  editor: '#/editor',
  ipcheck: '#/ipcheck',
  twofa: '#/twofa',
  usage: '#/usage',
  settings: '#/settings',
}

async function expectPageNavigationToWork(page: Page) {
  for (const pageId of pageIds) {
    const navItem = page.locator(`.sidebar-item[data-page="${pageId}"]`)
    await expect(navItem).toHaveCount(1)
    await navItem.click()
    await expect(navItem).toHaveClass(/\bactive\b/)
    await expect(page.locator('.page.active').first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(pageHash[pageId] === '#/deploy' ? '#/deploy/dashboard' : pageHash[pageId])
  }
}

test('Vue AppShell owns navigation after P8-5 cutover', async ({ page }) => {
  await page.setViewportSize({ width: 1665, height: 1184 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  await expect(page.locator('#app')).toHaveCount(1)
  await expect(page.locator('#vue-migration-host')).toHaveCount(0)
  await expect(page.locator('[data-app-shell-services]')).toHaveCount(1)
  await expect(page.locator('.app-sidebar .sidebar-item[data-page="home"]')).toHaveCount(1)
  await expect(page.locator('#page-home.page.active')).toHaveCount(1)
  await expect(page.locator('[data-v-app]')).toHaveCount(1)

  const migrationState = await page.evaluate(() => ({
    deferred: window.__DEVTOOLS_MIGRATION__?.deferred,
    mounted: Boolean(window.__DEVTOOLS_MIGRATION__?.app),
  }))
  expect(migrationState).toEqual({ deferred: false, mounted: true })

  await expectPageNavigationToWork(page)

  const body = page.locator('body')
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await expect(body).toHaveAttribute('data-theme', 'light')

  // 外观按钮循环主题（P8-4 单一写入）
  const themeBtn = page.locator('.sidebar-footer .sidebar-tool-button').filter({ hasText: '外观' })
  await themeBtn.click()
  await expect(body).toHaveAttribute('data-theme-mode', 'light')
  await expect(body).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('devtools-theme'))).toBe('light')

  await themeBtn.click()
  await expect(body).toHaveAttribute('data-theme-mode', 'dark')

  await themeBtn.click()
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(body).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(body).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await expect(body).toHaveAttribute('data-theme', 'light')

  await page.setViewportSize({ width: 900, height: 600 })
  await expectPageNavigationToWork(page)
})
