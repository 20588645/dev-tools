import { expect, test, type Page } from '@playwright/test'

interface SettingsMockState {
  timeout: number
  backups: Array<{ file: string; size: number; createdAt: number }>
  reportConfig: {
    token: string
    author: string
    outputDir: string
    repos: Array<{ repo: string; branch: string; group: string }>
  }
  writes: {
    settings: number[]
    report: number
    backups: number
    upgrades: number
  }
}

async function mockSettings(page: Page): Promise<SettingsMockState> {
  const state: SettingsMockState = {
    timeout: 60,
    backups: [
      { file: 'devtools-20260729-0942-auto.db', size: 2_800_000, createdAt: 1_753_756_920 },
      { file: 'devtools-20260728-0918-auto.db', size: 2_760_000, createdAt: 1_753_669_080 },
      { file: 'devtools-20260727-2314-manual.db', size: 2_710_000, createdAt: 1_753_632_840 },
      { file: 'devtools-20260726-0920-auto.db', size: 2_690_000, createdAt: 1_753_496_000 },
    ],
    reportConfig: {
      token: 'e2e-local-token',
      author: 'Ledy',
      outputDir: '',
      repos: [
        { repo: 'https://gitlab.example.com/team/web.git', branch: 'main', group: '前端' },
        { repo: 'https://gitlab.example.com/team/api.git', branch: 'develop', group: '后端' },
      ],
    },
    writes: { settings: [], report: 0, backups: 0, upgrades: 0 },
  }

  await page.route('**/api/health', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      uptime: 120,
      pid: 48102,
      version: '0.1.93',
      dataDir: '/tmp/devtools-e2e/data-test',
    }),
  }))

  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { connTimeoutSec: number }
      state.timeout = body.connTimeoutSec
      state.writes.settings.push(body.connTimeoutSec)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connTimeoutSec: state.timeout }),
    })
  })

  await page.route('**/api/projects/node-versions/list', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: 'v20.19.0', versions: ['v20.19.0', 'v18.19.1'] }),
  }))

  await page.route('**/api/backup/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/create')) {
      state.writes.backups += 1
      state.backups.unshift({
        file: 'devtools-20260729-1200-manual.db',
        size: 2_840_000,
        createdAt: 1_753_765_200,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ file: state.backups[0].file }),
      })
      return
    }
    if (url.pathname.endsWith('/restore') || url.pathname.endsWith('/restore-cancel')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    if (route.request().method() === 'DELETE') {
      const file = decodeURIComponent(url.pathname.split('/').pop() ?? '')
      state.backups = state.backups.filter((backup) => backup.file !== file)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ backups: state.backups, pendingRestore: false }),
    })
  })

  await page.route('**/api/report/config', async (route) => {
    if (route.request().method() === 'POST') {
      state.reportConfig = route.request().postDataJSON() as SettingsMockState['reportConfig']
      state.writes.report += 1
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().method() === 'POST' ? { ok: true } : state.reportConfig),
    })
  })

  await page.route('**/api/system/test-sidecars', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pids: [49100] }),
  }))

  await page.route('**/api/upgrade/start', async (route) => {
    state.writes.upgrades += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  return state
}

async function openSettings(page: Page, viewport = { width: 1280, height: 720 }) {
  await page.setViewportSize(viewport)
  const state = await mockSettings(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="settings"]').click()
  await expect(page.getByRole('heading', { name: '系统设置', exact: true })).toBeVisible()
  await expect(page.getByText('在线 · 13900', { exact: true }).first()).toBeVisible()
  return state
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.locator('[data-page-id="settings"]').evaluate((activePage) => ({
    documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pageX: activePage.scrollWidth > activePage.clientWidth,
    pageY: activePage.scrollHeight > activePage.clientHeight + 1,
    workspaceX: (activePage.querySelector('.settings-workspace')?.scrollWidth ?? 0)
      > (activePage.querySelector('.settings-workspace')?.clientWidth ?? 0),
  }))
  expect(layout).toEqual({ documentX: false, pageX: false, pageY: false, workspaceX: false })
}

async function expectFilledWorkspace(page: Page) {
  const metrics = await page.locator('[data-page-id="settings"]').evaluate((root) => {
    const workspace = root.querySelector('.settings-workspace')
    if (!workspace) return null
    const pageRect = root.getBoundingClientRect()
    const workspaceRect = workspace.getBoundingClientRect()
    const cards = [...root.querySelectorAll('.settings-panel-grid > .settings-card')]
      .map((card) => Math.round(card.getBoundingClientRect().height))
    return {
      bottomGap: Math.round(pageRect.bottom - workspaceRect.bottom),
      workspaceHeight: Math.round(workspaceRect.height),
      pageHeight: Math.round(pageRect.height),
      cardHeights: cards,
    }
  })
  expect(metrics).not.toBeNull()
  expect(metrics?.bottomGap).toBeGreaterThanOrEqual(8)
  expect(metrics?.bottomGap).toBeLessThanOrEqual(28)
  expect((metrics?.workspaceHeight ?? 0) / (metrics?.pageHeight ?? 1)).toBeGreaterThan(0.5)
  if ((metrics?.cardHeights.length ?? 0) === 2) {
    expect(Math.abs((metrics?.cardHeights[0] ?? 0) - (metrics?.cardHeights[1] ?? 0))).toBeLessThanOrEqual(2)
  }
}

function categoryButton(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('menuitem', { name })
}

test('mounts one formal Vue settings page and keeps both themes inside the default window', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openSettings(page)

  await expect(page.locator('[data-page-id="settings"]')).toHaveCount(1)
  await expect(page.locator('.settings-view')).toHaveCount(1)
  await expect(page.locator('.legacy-settings-fallback')).toHaveCount(0)
  await expect(page.locator('[data-page-id="settings"] .settings-content')).toHaveCount(0)
  await expect(page.locator('script[src="js/settings.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/settings.css"]')).toHaveCount(0)
  // 构建产物不再外链已删除的旧 CSS
  await expect(page.locator('link[href$="legacy-runtime.css"]')).toHaveCount(0)
  expect(await page.evaluate(() => ({
    loadSettings: typeof (window as unknown as { loadSettings?: unknown }).loadSettings,
    moveMenuItem: typeof (window as unknown as { moveMenuItem?: unknown }).moveMenuItem,
    resetMenuOrder: typeof (window as unknown as { resetMenuOrder?: unknown }).resetMenuOrder,
  }))).toEqual({
    loadSettings: 'undefined',
    moveMenuItem: 'undefined',
    resetMenuOrder: 'undefined',
  })
  await expect(page.getByRole('navigation', { name: '设置分类' })).toBeVisible()
  await expect(page.getByText('已运行 2 分钟', { exact: true })).toBeVisible()
  await expect(page.getByText('已安装 2 个版本', { exact: true })).toBeVisible()
  await expectNoPageOverflow(page)
  await expectFilledWorkspace(page)

  await categoryButton(page, '外观与通知').click()
  await page.getByRole('tab', { name: '亮色', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light')
  await expectNoPageOverflow(page)
  await expectFilledWorkspace(page)

  await page.getByRole('tab', { name: '暗色', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectNoPageOverflow(page)
})

test('keeps experimental effects owned by the app shell after removing legacy settings', async ({ page }) => {
  await openSettings(page)
  await categoryButton(page, '外观与通知').click()
  await page.getByRole('button', { name: /实验功能/ }).click()

  const clickEffectRow = page.locator('.settings-switch-row').filter({ hasText: '点击粒子' })
  await clickEffectRow.locator('.n-switch').click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('devtools-click-effect-enabled'))).toBe('true')

  const particleCount = await page.evaluate(() => {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 120 }))
    return document.querySelectorAll('.click-particle').length
  })
  expect(particleCount).toBe(7)

  await clickEffectRow.locator('.n-switch').click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('devtools-click-effect-enabled'))).toBe('false')
})

test('keeps six categories and search usable at 900 by 600', async ({ page }) => {
  await openSettings(page, { width: 900, height: 600 })
  await expectNoPageOverflow(page)
  await expectFilledWorkspace(page)

  for (const category of ['常规', '数据与备份', '外观与通知', 'Git 活动', '高级', '关于']) {
    await categoryButton(page, category).click()
    await expect(page.getByRole('heading', { name: category, exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await expectFilledWorkspace(page)
  }

  await page.getByRole('searchbox', { name: '搜索设置' }).fill('备份')
  await expect(page.getByRole('heading', { name: '搜索结果', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /数据备份/ })).toBeVisible()
  await page.getByRole('button', { name: /数据备份/ }).click()
  await expect(page.getByRole('heading', { name: '数据与备份', exact: true })).toBeVisible()
  await expectNoPageOverflow(page)
})

test('keeps settings categories on a top tab row and exposes search clearly', async ({ page }) => {
  await openSettings(page)

  const nav = page.getByRole('navigation', { name: '设置分类' })
  await expect(nav).toHaveClass(/base-side-nav--horizontal/)

  const layout = await page.locator('[data-page-id="settings"]').evaluate((root) => {
    const categoryNav = root.querySelector('.settings-category-nav')
    const content = root.querySelector('.settings-workspace__content')
    const items = [...(categoryNav?.querySelectorAll('[role="menuitem"]') ?? [])]
    const selected = categoryNav?.querySelector('.n-menu-item-content--selected')
    const navRect = categoryNav?.getBoundingClientRect()
    const contentRect = content?.getBoundingClientRect()
    const itemRects = items.map((item) => item.getBoundingClientRect())
    return {
      navAboveContent: Boolean(navRect && contentRect && navRect.bottom <= contentRect.top + 1),
      itemCount: items.length,
      sameRow: itemRects.length > 1 && itemRects.every((rect) => Math.abs(rect.top - itemRects[0].top) <= 4),
      selectedVisible: Boolean(selected),
    }
  })
  expect(layout).toEqual({
    navAboveContent: true,
    itemCount: 6,
    sameRow: true,
    selectedVisible: true,
  })

  const search = page.getByRole('searchbox', { name: '搜索设置' })
  await expect(search).toHaveAttribute('placeholder', '搜索设置，如：备份')
  await page.keyboard.press('Meta+k')
  await expect(search).toBeFocused()
  await search.fill('备份')
  await page.getByRole('button', { name: /数据备份/ }).click()
  await expect(page.getByRole('heading', { name: '数据与备份', exact: true })).toBeVisible()
})

test('saves timeout, menu order, backups, and Git config through their authoritative stores', async ({ page }) => {
  const state = await openSettings(page)

  const timeout = page.getByLabel('连接超时秒数')
  await timeout.fill('95')
  await timeout.blur()
  await expect.poll(() => state.writes.settings).toEqual([95])

  await expect(page.locator('.settings-menu-item[draggable="true"]')).toHaveCount(0)
  await expect(page.locator('.settings-menu-item__grip')).toHaveCount(0)
  const runRow = page.locator('.settings-menu-item').filter({ hasText: '本地运行' })
  await runRow.getByRole('button', { name: '下移', exact: true }).click()
  const savedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('devtools-menu-order') ?? '[]'))
  expect(savedOrder.slice(0, 2)).toEqual(['deploy', 'run'])

  await categoryButton(page, '数据与备份').click()
  await expect(page.locator('.settings-backup-row:not(.is-head)')).toHaveCount(3)
  await page.getByRole('button', { name: '查看全部 4 份', exact: true }).click()
  await expect(page.locator('.settings-backup-row:not(.is-head)')).toHaveCount(4)
  await page.getByRole('button', { name: '立即备份', exact: true }).click()
  await expect.poll(() => state.writes.backups).toBe(1)
  await expect(page.getByText('devtools-20260729-1200-manual.db', { exact: true })).toBeVisible()

  await categoryButton(page, 'Git 活动').click()
  await page.getByLabel('默认作者').fill('Ledy E2E')
  await expect(page.getByText('有未保存修改', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => state.writes.report).toBe(1)
  expect(state.reportConfig.author).toBe('Ledy E2E')
  await expect(page.getByText('配置已保存', { exact: true })).toBeVisible()
})

test('uses a two-stage update dialog and only reacts to mocked progress events', async ({ page }) => {
  const state = await openSettings(page)
  await categoryButton(page, '高级').click()
  await page.getByRole('button', { name: '检查并更新', exact: true }).click()

  await expect(page.getByText('这会在本机编译最新代码、覆盖 Applications 中的旧程序并自动重启。任务开始后请保持应用开启。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开始更新', exact: true }).click()
  await expect.poll(() => state.writes.upgrades).toBe(1)

  const progressDialog = page.getByRole('dialog').filter({ hasText: '正在更新 DevTools' })
  await expect(progressDialog).toBeVisible()

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('devtools:upgrade-progress', {
      detail: { event: 'Progress', percent: 62, log: '[mock] building frontend\\n' },
    }))
  })
  await expect(progressDialog.getByText('[mock] building frontend', { exact: false })).toBeVisible()

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('devtools:upgrade-progress', {
      detail: { event: 'Error', percent: 62, log: '[mock] stopped safely\\n' },
    }))
  })
  await expect(progressDialog.getByText('更新失败，请查看任务日志').first()).toBeVisible()
  await progressDialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expectNoPageOverflow(page)
})
