import { expect, test, type Page } from '@playwright/test'

const demoImage = {
  imagePath: '/tmp/Demo.dmg',
  imageName: 'Demo.dmg',
  volumeName: 'Demo',
  mounts: [{ mountPoint: '/Volumes/Demo', devEntry: '/dev/disk4s1' }],
  apps: [{ path: '/Volumes/Demo/Demo.app', name: 'Demo', mountPoint: '/Volumes/Demo' }],
}

async function openAppFix(page: Page, images: unknown[] = []) {
  const state = { images }
  await page.route('**/api/appfix/images', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.images) })
  })
  await page.route('**/api/appfix/repair', async (route) => {
    const body = route.request().postDataJSON() as { path?: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        path: body.path || '/Applications/Demo.app',
        name: 'Demo',
        attributes: [],
        hasQuarantine: false,
        hadQuarantine: true,
        cleared: ['com.apple.quarantine'],
        remaining: [],
      }),
    })
  })
  await page.route('**/api/appfix/settle', async (route) => {
    state.images = []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        path: '/Applications/Demo.app',
        name: 'Demo',
        copied: true,
        copySkipped: false,
        ejected: true,
        ejectError: '',
        volumeName: 'Demo',
        imagePath: '/tmp/Demo.dmg',
        mountPoint: '/Volumes/Demo',
        onImage: true,
        repair: {
          path: '/Applications/Demo.app',
          name: 'Demo',
          attributes: [],
          hasQuarantine: false,
          hadQuarantine: true,
          cleared: ['com.apple.quarantine'],
          remaining: [],
        },
      }),
    })
  })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="appfix"]').click()
  await expect(page.getByRole('heading', { name: '修复损坏', exact: true })).toBeVisible()
  return state
}

test('repairs an app path from the dedicated tool page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openAppFix(page)

  await expect(page.getByText('把 .app 拖到这里', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '适用场景', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '实际会做', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '明确不做', exact: true })).toBeVisible()
  await expect(page.getByText('不会打开「任何来源」', { exact: true })).toBeVisible()

  const layout = await page.locator('[data-page-id="appfix"]').evaluate((root) => {
    const board = root.querySelector('.app-fix-board')
    if (!board) return null
    const pageRect = root.getBoundingClientRect()
    const boardRect = board.getBoundingClientRect()
    return {
      cards: board.querySelectorAll('.base-card').length,
      bottomGap: Math.round(pageRect.bottom - boardRect.bottom),
    }
  })
  expect(layout?.cards).toBe(5)
  expect(layout?.bottomGap).toBeGreaterThanOrEqual(8)
  expect(layout?.bottomGap).toBeLessThanOrEqual(48)

  const controlHeights = await page.locator('[data-page-id="appfix"] .app-fix-toolbar').evaluate((toolbar) => {
    const input = toolbar.querySelector('.n-input')
    const buttons = [...toolbar.querySelectorAll('.base-button')]
    return {
      input: input ? Math.round(input.getBoundingClientRect().height) : 0,
      buttons: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
    }
  })
  expect(controlHeights.input).toBe(32)
  expect(controlHeights.buttons).toEqual([32, 32])

  await page.getByRole('button', { name: '开始修复', exact: true }).click()
  await expect(page.getByText('请选择或输入 .app 路径', { exact: true })).toBeVisible()

  await page.getByRole('textbox', { name: '应用路径' }).fill('/tmp/Demo.app')
  await page.getByRole('button', { name: '开始修复', exact: true }).click()
  await expect(page.locator('[data-page-id="appfix"] .app-fix-result')).toContainText('已清除隔离属性，可以再试着打开这个应用。')
  await expect(page.locator('[data-page-id="appfix"]').getByText('/tmp/Demo.app')).toBeVisible()

  const overflow = await page.locator('[data-page-id="appfix"]').evaluate((root) => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    page: root.scrollWidth > root.clientWidth,
  }))
  expect(overflow).toEqual({ document: false, page: false })
})

test('copies an app off a mounted install image then ejects it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openAppFix(page, [demoImage])

  await expect(page.getByRole('heading', { name: '已挂载的安装镜像', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '推出', exact: true })).toBeVisible()

  await page.getByRole('textbox', { name: '应用路径' }).fill('/Volumes/Demo/Demo.app')
  await page.getByRole('button', { name: '开始修复', exact: true }).click()
  await expect(page.locator('[data-page-id="appfix"] .app-fix-result')).toContainText('应用还在安装镜像里')
  await page.getByRole('button', { name: '拷到应用程序并推出', exact: true }).click()
  await expect(page.locator('[data-page-id="appfix"] .app-fix-result')).toContainText('/Applications/Demo.app')
  await expect(page.getByRole('heading', { name: '已挂载的安装镜像', exact: true })).toHaveCount(0)
})
