import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * 构建 / 部署弹窗 E2E。
 *
 * 全程路由拦截：不触发真实构建、部署或 SSH。只断言弹窗开合、载荷与忙态入口。
 */

function buildProjects() {
  return [
    {
      name: 'portal', displayName: '门户', type: 'multi-module',
      tool: 'vite', nodeVersion: '18.20.4', buildCommand: 'npm run build', path: '/tmp/portal',
      modules: [
        { name: 'home', uploadStrategy: 'folder' },
        { name: 'admin', uploadStrategy: 'folder' },
      ],
      runCommand: '', runPort: '', runHomeModule: 'home', runIncludeHome: true,
      favoriteRunModules: [], groupName: '',
      defaultServerIds: ['srv-1'], defaultServerId: 'srv-1',
    },
    {
      name: 'blog', displayName: '博客', type: 'single',
      tool: 'vite', nodeVersion: '', buildCommand: 'npm run build', path: '/tmp/blog',
      modules: [], runCommand: '', runPort: '', runHomeModule: 'home', runIncludeHome: true,
      favoriteRunModules: [], groupName: '',
      defaultServerIds: [], defaultServerId: '',
    },
  ]
}

function buildServers() {
  return [
    {
      id: 'srv-1', name: 'prod', host: '10.0.0.1', port: 22, username: 'deploy',
      authType: 'password', password: '****', defaultRemotePath: '/www/',
      deployPaths: ['/www/', '/backup/'],
    },
    {
      id: 'srv-2', name: 'stage', host: '10.0.0.2', port: 22, username: 'deploy',
      authType: 'password', password: '****', defaultRemotePath: '/stage/',
      deployPaths: ['/stage/'],
    },
  ]
}

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

interface DeployMock {
  builds: unknown[]
  deploys: unknown[]
}

async function mockDeployApis(page: Page): Promise<DeployMock> {
  const mock: DeployMock = { builds: [], deploys: [] }

  await page.route('**/api/projects/node-versions/list', (route) =>
    fulfill(route, { versions: ['18.20.4', '20.11.1'], current: '18.20.4' }))

  await page.route('**/api/projects**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.includes('/git-log')) {
      return fulfill(route, {
        branch: 'main',
        commits: [{ hash: 'abc1234', message: 'fix: dialog', author: 'ldy', time: new Date().toISOString() }],
      })
    }
    if (request.method() === 'PUT') return fulfill(route, { success: true })
    if (url.pathname === '/api/projects' || url.pathname.endsWith('/api/projects')) {
      return fulfill(route, buildProjects())
    }
    return fulfill(route, {})
  })

  await page.route('**/api/servers**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/quick-test')) {
      return fulfill(route, { id: 'srv-1', success: true, duration: 42 })
    }
    if (url.pathname.endsWith('/browse')) {
      return fulfill(route, { path: '/www/', items: [], fallback: '' })
    }
    return fulfill(route, buildServers())
  })

  await page.route('**/api/deploy/build', async (route) => {
    mock.builds.push(route.request().postDataJSON())
    return fulfill(route, { id: 'build-e2e-1' })
  })

  await page.route('**/api/deploy/start', async (route) => {
    mock.deploys.push(route.request().postDataJSON())
    return fulfill(route, { id: 'deploy-e2e-1' })
  })

  await page.route('**/api/deploy/active', (route) => fulfill(route, null))
  await page.route('**/api/deploy/history**', (route) => fulfill(route, []))
  await page.route('**/api/settings**', (route) => fulfill(route, { connTimeoutSec: 60 }))

  return mock
}

async function openDeployDashboard(page: Page) {
  await page.goto('/')
  await page.locator('.sidebar-item[data-page="deploy"]').click()
  await expect(page.locator('[data-page-id="deploy"]')).toBeVisible()
  await expect(page.locator('[data-test="deploy-dashboard"]')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('fav_portal')
    localStorage.removeItem('last_portal')
    localStorage.removeItem('deployCollapsedGroups')
    localStorage.removeItem('deployGroupOrder')
  })
})

test('构建弹窗：勾选模块后发起构建（拦截真实请求）', async ({ page }) => {
  const mock = await mockDeployApis(page)
  await openDeployDashboard(page)

  const card = page.locator('.deploy-card', { hasText: '门户' }).first()
  await card.getByRole('button', { name: '构建' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('构建项目')).toBeVisible()
  await expect(dialog.getByText('最近提交')).toBeVisible()
  await expect(dialog.getByText('abc1234')).toBeVisible()

  await dialog.locator('.build-deploy__module-name', { hasText: 'admin' }).click()
  await dialog.getByRole('button', { name: '开始构建' }).click()

  await expect.poll(() => mock.builds.length).toBe(1)
  expect(mock.builds[0]).toMatchObject({
    projectName: 'portal',
    modules: ['admin'],
    nodeVersion: '18.20.4',
  })
  // 构建弹窗关掉，日志弹窗接上——不能断言 dialog 归零
  await expect(page.getByRole('dialog').getByText('构建进度')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('构建项目')).toHaveCount(0)
})

test('部署弹窗：默认勾选服务器并可打开远程浏览', async ({ page }) => {
  await mockDeployApis(page)
  await openDeployDashboard(page)

  const card = page.locator('.deploy-card', { hasText: '门户' }).first()
  await card.getByRole('button', { name: '部署' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('部署项目')).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: /prod/ })).toBeChecked()

  await dialog.getByRole('button', { name: '浏览' }).click()
  const browser = page.getByRole('dialog').filter({ hasText: '远程目录浏览' })
  await expect(browser).toBeVisible()
  await expect(browser.getByText('prod (10.0.0.1)')).toBeVisible()
  await browser.getByRole('button', { name: '选择此目录' }).click()
  await expect(browser).toHaveCount(0)
})

test('legacy 构建/部署弹窗 DOM 已退役', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#buildModal')).toHaveCount(0)
  await expect(page.locator('#deployModal')).toHaveCount(0)
  await expect(page.locator('#remoteBrowserModal')).toHaveCount(0)
})
