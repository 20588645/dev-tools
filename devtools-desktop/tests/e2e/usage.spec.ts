import { expect, test, type Page, type Route } from '@playwright/test'

const summary = {
  requests: 2166,
  pricedRequests: 0,
  inputTokens: 156342189,
  outputTokens: 42781512,
  cacheReadTokens: 119044721,
  cacheCreationTokens: 5966542,
  pricedTokens: 0,
  totalTokens: 324134964,
  cacheHitRate: 0.956,
  pricingCoverage: 0,
  costMicroUsd: 0,
  costUsd: 0,
  cacheSavedUsd: 0,
}

const models = [
  { model: 'gpt-5.6-sol', displayName: 'gpt-5.6-sol', appType: 'codex', pricingModel: '', requests: 2119, inputTokens: 120000000, outputTokens: 30000000, cacheReadTokens: 160000000, cacheCreationTokens: 7000000, costMicroUsd: 0 },
  { model: 'claude-opus-4-1', displayName: 'Claude Opus 4.1', appType: 'claude', pricingModel: '', requests: 47, inputTokens: 2000000, outputTokens: 800000, cacheReadTokens: 3000000, cacheCreationTokens: 1000000, costMicroUsd: 0 },
]

const projects = [
  { project: 'personalTools', apps: ['codex'], requests: 1028, inputTokens: 80000000, outputTokens: 12000000, cacheReadTokens: 70000000, cacheCreationTokens: 6000000, costMicroUsd: 0 },
  { project: 'ldts', apps: ['codex', 'claude'], requests: 642, inputTokens: 50000000, outputTokens: 8000000, cacheReadTokens: 40000000, cacheCreationTokens: 3000000, costMicroUsd: 0 },
]

const logs = Array.from({ length: 15 }, (_, index) => ({
  requestId: `request-${index}`,
  sessionId: `session-${index}`,
  projectDir: index % 2 ? 'ldts' : 'personalTools',
  appType: index % 3 ? 'codex' : 'claude',
  model: index % 3 ? 'gpt-5.6-sol' : 'claude-opus-4-1',
  pricingModel: '',
  inputTokens: 1000 + index,
  outputTokens: 100 + index,
  cacheReadTokens: 8000 + index,
  cacheCreationTokens: 20,
  costMicroUsd: 0,
  createdAt: 1785300000 - index * 60,
}))

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockUsage(page: Page) {
  const requests: string[] = []
  const writes: Array<{ path: string; body: unknown }> = []
  await page.route('**/api/usage/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    requests.push(`${request.method()} ${path}${url.search}`)

    if (request.method() === 'GET' && path === '/api/usage/summary') return fulfill(route, summary)
    if (request.method() === 'GET' && path === '/api/usage/models') return fulfill(route, models)
    if (request.method() === 'GET' && path === '/api/usage/projects') return fulfill(route, projects)
    if (request.method() === 'GET' && path === '/api/usage/top') return fulfill(route, logs.slice(0, 6))
    if (request.method() === 'GET' && path === '/api/usage/rate') return fulfill(route, { rate: 7.2, source: 'cache', fetchedAt: 1785300000 })
    if (request.method() === 'GET' && path === '/api/usage/trends') {
      return fulfill(route, Array.from({ length: 12 }, (_, index) => ({
        bucket: `2026-07-29 ${String(index * 2).padStart(2, '0')}:00`,
        requests: index * 2,
        inputTokens: index * 1000000,
        outputTokens: index * 100000,
        cacheReadTokens: index * 2000000,
        cacheCreationTokens: index * 10000,
        costMicroUsd: 0,
      })))
    }
    if (request.method() === 'GET' && path === '/api/usage/logs') {
      return fulfill(route, { total: 30, page: Number(url.searchParams.get('page')) || 1, pageSize: 15, rows: logs })
    }
    if (request.method() === 'GET' && path === '/api/usage/pricing') {
      return fulfill(route, models.map((model) => ({
        modelId: model.model,
        displayName: model.displayName,
        inputPerM: 0,
        outputPerM: 0,
        cacheReadPerM: 0,
        cacheCreationPerM: 0,
        source: 'manual',
        confidence: 'manual',
        fetchedAt: 0,
      })))
    }
    if (request.method() === 'POST' && path === '/api/usage/pricing/sync') {
      writes.push({ path, body: request.postDataJSON() })
      return fulfill(route, {
        fetchedAt: 1785300000,
        total: 3,
        applied: 2,
        unchanged: 0,
        unmatched: 1,
        conflicts: 1,
        repriced: 2166,
        sources: [{ source: 'models.dev', url: 'https://models.dev/api.json', ok: true, count: 100, error: '' }],
      })
    }
    if (request.method() === 'POST' && path === '/api/usage/sync') return fulfill(route, { files: 20, upserted: 10 })
    if (request.method() === 'POST' && path === '/api/usage/import-ccswitch') return fulfill(route, { scanned: 100, imported: 2, pricingImported: 1 })
    if (request.method() === 'PUT' && path.startsWith('/api/usage/pricing/')) {
      writes.push({ path, body: request.postDataJSON() })
      return fulfill(route, { success: true, repriced: 2166 })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"未模拟"}' })
  })
  return { requests, writes }
}

async function openUsage(page: Page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport)
  const mock = await mockUsage(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="usage"]').click()
  await expect(page).toHaveURL(/#\/usage/)
  await expect(page.locator('#page-usage')).toBeVisible()
  await expect(page.getByRole('heading', { name: '用量统计', exact: true })).toBeVisible()
  // redesign-v2：总量落在首张 stat 卡（紧凑格式）
  await expect(page.locator('.usage-stats .stat-card').first()).toContainText('3.24 亿')
  await expect(page.getByRole('region', { name: '项目用量排名' })).toBeVisible()
  await expect(page.getByRole('region', { name: '高用量请求排名' })).toBeVisible()
  await expect(page.getByRole('region', { name: '模型用量统计' })).toBeVisible()
  return mock
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.locator('#page-usage').evaluate((activePage) => {
    // P8 后 RouterView 根即 View 根：#page-usage 与 .usage-view 是同一元素
    const view = activePage.matches('.usage-view') ? activePage : activePage.querySelector('.usage-view')
    return {
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageX: activePage.scrollWidth > activePage.clientWidth,
      pageY: activePage.scrollHeight > activePage.clientHeight + 1,
      viewX: view ? view.scrollWidth > view.clientWidth + 1 : true,
    }
  })
  expect(layout).toEqual({ documentX: false, pageX: false, pageY: false, viewX: false })
}

test('mounts one Vue usage page without the retired DOM or scripts', async ({ page }) => {
  await openUsage(page)
  await expect(page.locator('#page-usage')).toHaveCount(1)
  await expect(page.locator('.usage-view')).toHaveCount(1)
  await expect(page.locator('#usageTrendChart')).toHaveCount(0)
  await expect(page.locator('script[src="js/usage.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/usage.css"]')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Cursor', exact: true })).toBeVisible()
  await expect(page.locator('.chart-slider')).toHaveCount(0)
  await expectNoPageOverflow(page)
})

test('keeps the dashboard usable in both themes at 900 by 600', async ({ page }) => {
  await openUsage(page, { width: 900, height: 600 })
  await expectNoPageOverflow(page)
  await expect(page.getByText('Token 构成', { exact: true })).toBeVisible()

  // P9-8：主题菜单已删，侧栏按钮循环 system→light→dark
  for (let i = 0; i < 3 && !(await page.locator('body[data-theme="dark"]').count()); i++) {
    await page.locator('[data-test="theme-toggle"]').click()
  }
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectNoPageOverflow(page)
})

test('filters data and paginates logs through Vue state', async ({ page }) => {
  const mock = await openUsage(page)
  await page.getByRole('tab', { name: 'Cursor', exact: true }).click()
  await expect.poll(() => mock.requests.some((request) => request.includes('app=cursor') && request.includes('/api/usage/summary'))).toBe(true)

  await page.getByRole('tab', { name: '近 7 天', exact: true }).click()
  await expect.poll(() => mock.requests.some((request) => request.includes('start=') && request.includes('/api/usage/summary'))).toBe(true)

  await page.getByRole('tab', { name: '请求日志', exact: true }).click()
  await expect(page.getByRole('region', { name: '用量请求日志' })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect.poll(() => mock.requests.some((request) => request.includes('/api/usage/logs') && request.includes('page=2'))).toBe(true)
})

test('syncs and overwrites matched pricing without candidate actions', async ({ page }) => {
  const mock = await openUsage(page)
  // 顶部按钮已移除，价格设置改为从底部「数据探索 → 价格设置」进入
  await page.getByRole('tab', { name: '价格设置', exact: true }).click()
  await page.getByRole('button', { name: '打开数据与价格设置', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('region', { name: '模型单价设置' })).toBeVisible()
  await expect(page.getByText('可靠匹配项', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '应用', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '应用候选', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '同步并覆盖', exact: true }).click()
  await expect(page.getByText('2 已覆盖', { exact: true })).toBeVisible()
  await expect(page.getByText('1 未匹配', { exact: true })).toBeVisible()
  expect(mock.writes.some((write) => write.path === '/api/usage/pricing/sync')).toBe(true)
})

test('hides the retired header entries and keeps a default refresh interval', async ({ page }) => {
  await openUsage(page)
  // 顶部两个按钮已隐藏：价格设置与底部 Tab 重复，CC Switch 导入是一次性迁移入口
  await expect(page.getByRole('button', { name: '数据与价格设置', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导入 CC Switch 历史', exact: true })).toHaveCount(0)
  // 未设置过时必须是 30s，不能因为 Number(null) === 0 落到「关闭」
  await expect(page.locator('.usage-refresh-select')).toContainText('30s')
})

test('queries an explicit window when a custom range is applied', async ({ page }) => {
  const mock = await openUsage(page)
  await page.getByRole('tab', { name: '自定义', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const start = dialog.locator('input').first()
  await start.fill('2026-06-01 00:00:00')
  await start.press('Enter')
  await dialog.getByRole('checkbox').click()

  const end = dialog.locator('input').nth(1)
  await end.fill('2026-06-15 00:00:00')
  await end.press('Enter')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.usage-custom-chip')).toContainText('06/01')
  // 自定义区间必须带上明确的 start 与 end
  await expect.poll(() => mock.requests.some((request) => request.includes('/api/usage/summary')
    && request.includes('start=')
    && request.includes('end='))).toBe(true)
})
