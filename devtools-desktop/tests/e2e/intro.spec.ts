import { expect, test } from '@playwright/test'

test('opens a portrait intro dialog from the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?apiPort=13900')
  await page.getByTitle('项目介绍').click()

  const dialog = page.getByRole('dialog').filter({ hasText: 'DevTools Desktop' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('img', { name: '开发者在本地工作台前工作' })).toBeVisible()
  await expect(dialog.getByText('本地运行', { exact: true })).toBeVisible()
  await expect(dialog.getByText('系统通知')).toHaveCount(0)

  const layout = await dialog.evaluate((root) => {
    const portrait = root.querySelector('.intro-portrait')?.getBoundingClientRect()
    const copy = root.querySelector('.intro-copy')?.getBoundingClientRect()
    return {
      sideBySide: Boolean(
        portrait
        && copy
        && Math.abs(portrait.top - copy.top) <= 16
        && portrait.right <= copy.left + 2,
      ),
    }
  })
  expect(layout.sideBySide).toBe(true)

  await dialog.getByRole('button', { name: '知道了', exact: true }).click()
  await expect(dialog).toBeHidden()
})
