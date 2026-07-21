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
  await page.goto('/')

  for (const pageId of pageIds) {
    await expect(page.locator(`#page-${pageId}`)).toHaveCount(1)
  }

  await expect(page.locator('#vue-home-root')).toHaveCount(1)
  await expect(page.locator('#vue-migration-host')).toHaveAttribute('hidden', '')
  await expect(page.locator('[data-v-app]')).toHaveCount(1)

  const migrationState = await page.evaluate(() => ({
    deferred: window.__DEVTOOLS_MIGRATION__?.deferred,
    mounted: Boolean(window.__DEVTOOLS_MIGRATION__?.app),
  }))
  expect(migrationState).toEqual({ deferred: true, mounted: false })

  await expectPageNavigationToWork(page)

  const initialTheme = await page.locator('body').getAttribute('data-theme')
  await page.locator('[title="切换主题"]').click()
  await expect(page.locator('body')).not.toHaveAttribute('data-theme', initialTheme ?? '')

  await page.setViewportSize({ width: 900, height: 600 })
  await expectPageNavigationToWork(page)
})
