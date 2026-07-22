import { expect, test, type Page } from '@playwright/test'

const pageIds = [
  'home', 'run', 'deploy', 'filetransfer', 'terminal', 'todo', 'report',
  'notes', 'notebook', 'editor', 'ipcheck', 'twofa', 'usage', 'settings',
] as const

async function expectPageNavigationToWork(page: Page) {
  for (const pageId of pageIds) {
    const navItem = page.locator(`.sidebar-item[data-page="${pageId}"]`)
    await expect(navItem).toHaveCount(1)
    await navItem.click()

    await expect(page.locator('.page.active')).toHaveCount(1)
    await expect(page.locator(`#page-${pageId}`)).toHaveClass(/\bactive\b/)

    const layout = await page.locator(`#page-${pageId}`).evaluate((activePage) => ({
      documentHasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageHasHorizontalOverflow: activePage.scrollWidth > activePage.clientWidth,
    }))
    expect(layout.documentHasHorizontalOverflow).toBe(false)
    expect(layout.pageHasHorizontalOverflow).toBe(false)
  }
}

test('Vite serves the complete legacy shell', async ({ page }) => {
  await page.setViewportSize({ width: 1665, height: 1184 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  for (const pageId of pageIds) {
    await expect(page.locator(`#page-${pageId}`)).toHaveCount(1)
  }

  await expect(page.locator('#vue-home-root')).toHaveCount(0)
  await expect(page.locator('#vue-migration-host')).toHaveCount(1)
  await expect(page.locator('[data-migration-host]')).toHaveCount(1)
  await expect(page.locator('[data-v-app]')).toHaveCount(1)

  const migrationState = await page.evaluate(() => ({
    deferred: window.__DEVTOOLS_MIGRATION__?.deferred,
    mounted: Boolean(window.__DEVTOOLS_MIGRATION__?.app),
  }))
  expect(migrationState).toEqual({ deferred: false, mounted: true })

  await expectPageNavigationToWork(page)

  const body = page.locator('body')
  const themeToggle = page.locator('#themeModeToggle')
  const themeMenu = page.locator('#themeModeMenu')
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await expect(body).toHaveAttribute('data-theme', 'light')

  await themeToggle.click()
  await expect(themeMenu).toBeVisible()
  await expect(themeMenu.locator('[data-theme-mode="system"]')).toHaveAttribute('aria-checked', 'true')

  await themeMenu.locator('[data-theme-mode="dark"]').click()
  await expect(themeMenu).toBeHidden()
  await expect(body).toHaveAttribute('data-theme-mode', 'dark')
  await expect(body).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('devtools-theme'))).toBe('dark')

  await themeToggle.click()
  await themeMenu.locator('[data-theme-mode="system"]').click()
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(body).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(body).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('devtools-theme'))).toBe('system')

  await page.reload()
  await expect(body).toHaveAttribute('data-theme-mode', 'system')
  await expect(body).toHaveAttribute('data-theme', 'light')

  await page.setViewportSize({ width: 900, height: 600 })
  await expectPageNavigationToWork(page)
})
