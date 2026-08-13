import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * 本地运行页 E2E。
 *
 * 全程走 Playwright 路由拦截，**不触发任何真实进程**：start / stop / restart /
 * batch-stop / force-release 都只断言请求是否发出与载荷内容，绝不落到 Sidecar。
 */

function buildProjects() {
  return [
    {
      name: 'b8seed-portal', displayName: 'b8seed 门户(多模块)', type: 'multi-module',
      tool: 'vite', nodeVersion: '18.20.4', buildCommand: 'npm run build', path: '/tmp/b8seed-portal',
      modules: [
        { name: 'home', uploadStrategy: 'folder' },
        { name: 'admin', uploadStrategy: 'folder' },
        { name: 'dashboard', uploadStrategy: 'folder' },
      ],
      runCommand: '', runPort: '', runHomeModule: 'home', runIncludeHome: true,
      favoriteRunModules: ['admin'], groupName: '',
    },
    {
      name: 'b8seed-blog', displayName: 'b8seed 博客(单体)', type: 'single',
      tool: 'webpack', nodeVersion: '', buildCommand: 'npm run build', path: '/tmp/b8seed-blog',
      modules: [], runCommand: '', runPort: '8090', runHomeModule: 'home', runIncludeHome: true,
      favoriteRunModules: [], groupName: '',
    },
    {
      name: 'b8seed-shop', displayName: 'b8seed 商城(单体)', type: 'single',
      tool: 'vite', nodeVersion: '20.11.1', buildCommand: 'npm run build', path: '/tmp/b8seed-shop',
      modules: [], runCommand: '', runPort: '', runHomeModule: 'home', runIncludeHome: true,
      favoriteRunModules: [], groupName: '',
    },
  ]
}

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-e2e-1', projectName: 'b8seed-portal', moduleName: 'home', moduleNames: ['home'],
    includeHome: true, command: 'npm run dev', nodeVersion: '18.20.4', port: 8080,
    url: 'http://localhost:8080', status: 'running', pid: 4242,
    startedAt: Date.now() - 3_725_000, stoppedAt: null, exitCode: null, error: '',
    compileStatus: '', compileError: '', compileErrorAt: null, compileErrorSeq: 0,
    autoRestart: false, autoRestartCount: 0, autoRestartMax: 3, ...overrides,
  }
}

const HISTORY = [
  {
    id: 'h-1', projectName: 'b8seed-portal', modules: ['home', 'admin'], command: 'npm run dev',
    nodeVersion: '18.20.4', status: 'success', startedAt: '2026-07-31T00:54:00.000Z',
    stoppedAt: '2026-07-31T01:54:00.000Z', duration: '1h 0m', exitCode: 0,
  },
  {
    id: 'h-2', projectName: 'b8seed-blog', modules: [], command: 'npm run dev',
    nodeVersion: '', status: 'stopped', startedAt: '2026-07-31T01:24:00.000Z',
    stoppedAt: '2026-07-31T01:31:00.000Z', duration: '6m 40s', exitCode: 0,
  },
  {
    id: 'h-3', projectName: 'b8seed-shop', modules: ['dashboard'], command: 'npm run dev',
    nodeVersion: '20.11.1', status: 'error', startedAt: '2026-07-31T02:24:00.000Z',
    stoppedAt: '2026-07-31T02:26:00.000Z', duration: '1m 40s', exitCode: 1,
  },
]

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

/**
 * 分组折叠态与排序存 localStorage，会跨用例泄漏（上一个用例折叠的分组会让下一个
 * 用例的首组变成「未分组」）。每个用例开跑前清一次。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('runCollapsedGroups')
    localStorage.removeItem('runGroupOrder')
  })
})

interface RunMock {
  writes: Array<{ method: string; path: string; body: unknown }>
  statuses: unknown[]
  setStatuses: (jobs: unknown[]) => void
}

async function mockRun(page: Page, projects = buildProjects()): Promise<RunMock> {
  const mock: RunMock = {
    writes: [],
    statuses: [],
    setStatuses: (jobs) => { mock.statuses = jobs },
  }

  await page.route('**/api/projects**', async (route) => {
    const request = route.request()
    if (request.method() === 'PUT') {
      mock.writes.push({ method: 'PUT', path: new URL(request.url()).pathname, body: request.postDataJSON() })
      return fulfill(route, { success: true })
    }
    if (new URL(request.url()).pathname.includes('node-versions')) {
      return fulfill(route, { versions: ['18.20.4', '20.11.1'], current: '18.20.4' })
    }
    return fulfill(route, projects)
  })

  await page.route('**/api/run/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (method === 'GET' && path === '/api/run/status') return fulfill(route, mock.statuses)
    if (method === 'GET' && path === '/api/run/history') return fulfill(route, HISTORY)
    if (method === 'GET' && path.startsWith('/api/run/port-owner/')) {
      return fulfill(route, {
        inUse: true, pid: 99_999, pids: [99_999], user: 'ldy',
        command: 'node', commandPath: '/opt/homebrew/bin/node',
      })
    }
    if (method === 'GET' && path.startsWith('/api/run/port-check/')) {
      return fulfill(route, { port: 8080, inUse: false, pids: [] })
    }
    // 以下均为有副作用的接口：只记录，不放行
    mock.writes.push({ method, path, body: method === 'DELETE' ? null : request.postDataJSON() })
    if (path === '/api/run/start') return fulfill(route, buildJob({ status: 'starting' }))
    if (path.endsWith('/stop') || path.endsWith('/restart')) return fulfill(route, buildJob({ status: 'stopping' }))
    if (path === '/api/run/batch-stop') return fulfill(route, { stopped: ['b8seed-portal'] })
    if (path === '/api/run/force-release') return fulfill(route, { success: true })
    return fulfill(route, { success: true })
  })

  return mock
}

async function openRun(page: Page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport)
  const mock = await mockRun(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()
  await expect(page.getByRole('heading', { name: '本地运行', exact: true })).toBeVisible()
  await expect(page.locator('.run-card')).toHaveCount(3)
  return mock
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pageX: (() => {
      const active = document.getElementById('page-run')
      return active ? active.scrollWidth > active.clientWidth : true
    })(),
  }))
  expect(overflow).toEqual({ documentX: false, pageX: false })
}

test('mounts one Vue run page without the retired DOM or scripts', async ({ page }) => {
  await openRun(page)
  await expect(page.locator('#page-run')).toHaveCount(1)
  await expect(page.locator('script[src="js/run.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/run.css"]')).toHaveCount(0)
  // 旧页面 DOM 与两个旧弹窗都已移除
  await expect(page.locator('#runProjectGrid, #runOverview, #runSearchInput')).toHaveCount(0)
  await expect(page.locator('#runModal, #runHistoryModal')).toHaveCount(0)
  // 日志弹窗已迁为公共 LogViewer
  await expect(page.locator('#logModal')).toHaveCount(0)
  await expectNoPageOverflow(page)
})

test('shows the multi-module count instead of the meaningless saved-command stat', async ({ page }) => {
  await openRun(page)
  // redesign-v2：三个统计并进页头副题一句话（原型 page-sub），不再占独立一行
  const summary = page.locator('#page-run .page-header__copy p')
  await expect(summary).toHaveText('3 个项目 · 0 运行中 · 1 多模块')
})

test('filters by keyword and by project kind', async ({ page }) => {
  await openRun(page)
  const search = page.locator('#page-run input[placeholder="搜索可运行项目..."]')

  await search.fill('blog')
  await expect(page.locator('.run-card')).toHaveCount(1)
  await search.fill('zzzz')
  await expect(page.locator('.run-card')).toHaveCount(0)
  await expect(page.locator('#page-run')).toContainText('没有匹配的项目')

  await search.fill('')
  await expect(page.locator('.run-card')).toHaveCount(3)

  // redesign-v2：筛选从 FilterChip 换成原型的 .seg 分段器
  const filters = page.locator('#page-run .page-toolbar .base-segmented .n-tabs-tab')
  await filters.filter({ hasText: '多模块' }).click()
  await expect(page.locator('.run-card')).toHaveCount(1)
  await filters.filter({ hasText: '单体项目' }).click()
  await expect(page.locator('.run-card')).toHaveCount(2)
})

test('keeps the toolbar on one row when a service is running', async ({ page }) => {
  const mock = await openRun(page, { width: 900, height: 600 })
  await expectNoPageOverflow(page)

  // P1：旧实现「全部停止」出现后工具栏会换行、把「运行历史」挤到第二行
  mock.setStatuses([buildJob()])
  await page.reload()
  await page.locator('.sidebar-item[data-page="run"]').click()
  await expect(page.locator('.run-card.project-card--running')).toHaveCount(1)

  const toolbarHeight = await page.locator('#page-run .page-toolbar').evaluate(el => el.getBoundingClientRect().height)
  expect(toolbarHeight).toBeLessThan(60)
  await expectNoPageOverflow(page)
})

test('keeps running-card actions on one row', async ({ page }) => {
  const mock = await mockRun(page)
  mock.setStatuses([buildJob()])
  await page.setViewportSize({ width: 900, height: 600 })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()

  const card = page.locator('.run-card[data-project="b8seed-portal"]')
  await expect(card).toHaveClass(/project-card--running/)
  // P2：旧实现四个按钮会换行，「打开地址」掉到第二行。
  // 比较垂直中心而不是 top：图标按钮与 sm 按钮高度不同，top 本就有几像素差。
  const centers = await card.locator('.project-card__actions button').evaluateAll(
    buttons => buttons.map((b) => {
      const rect = b.getBoundingClientRect()
      return Math.round(rect.top + rect.height / 2)
    }),
  )
  expect(new Set(centers).size).toBe(1)
})

test('keeps the running total aligned when an older stopped job is also returned', async ({ page }) => {
  const mock = await mockRun(page)
  mock.setStatuses([
    buildJob({ id: 'run-old', status: 'stopped', stoppedAt: Date.now() - 1_000 }),
    buildJob({ id: 'run-current', status: 'running' }),
  ])
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()

  await expect(page.locator('#page-run .page-header__copy p')).toContainText('1 运行中')
  await expect(page.locator('.run-card.project-card--running')).toHaveCount(1)
  await expect(page.locator('.run-card[data-project="b8seed-portal"]')).toHaveClass(/project-card--running/)
})

test('warns with full process details before force-releasing a port', async ({ page }) => {
  const mock = await mockRun(page)
  // 启动失败并报端口被外部进程占用 → 进入诊断与强释确认
  await page.route('**/api/run/start', async (route) => {
    mock.writes.push({ method: 'POST', path: '/api/run/start', body: route.request().postDataJSON() })
    await route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: '端口 8090 已被外部进程占用 (PIDs: 99999)', code: 'EADDRINUSE', port: 8090 }),
    })
  })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()

  const card = page.locator('.run-card[data-project="b8seed-blog"]')
  await card.getByRole('button', { name: '启动运行' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('强制释放端口')
  // F4：非本应用启动的进程必须显著警示，并给出完整路径供判断
  await expect(dialog).toContainText('不像是本应用启动的')
  await expect(dialog).toContainText('/opt/homebrew/bin/node')
  await expect(dialog).toContainText('99999')
  await expect(dialog).toContainText('此操作不可撤销')

  // 未确认前绝不能发出强杀请求
  expect(mock.writes.some(w => w.path === '/api/run/force-release')).toBe(false)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(mock.writes.some(w => w.path === '/api/run/force-release')).toBe(false)
})

test('requires picking a module before a multi-module project can start', async ({ page }) => {
  const mock = await openRun(page)
  await page.locator('.run-card[data-project="b8seed-portal"]').getByRole('button', { name: '启动运行' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('快捷运行模块')

  // 默认勾上首页模块；取消后必须禁用启动，事前引导而非点了才报错
  const submit = dialog.getByRole('button', { name: '▶ 启动运行' })
  await dialog.locator('.run-config__chips .n-tag', { hasText: 'home' }).click()
  await expect(submit).toBeDisabled()
  expect(mock.writes.some(w => w.path === '/api/run/start')).toBe(false)

  await dialog.locator('.run-config__chips .n-tag', { hasText: 'admin' }).click()
  await expect(submit).toBeEnabled()
})

test('forces the configured port instead of silently inferring one', async ({ page }) => {
  const mock = await openRun(page)
  // F3：旧实现填了端口也不生效，PORT 仍取推断值
  await page.locator('.run-card[data-project="b8seed-blog"]').getByRole('button', { name: '启动运行' }).click()
  await expect.poll(() => mock.writes.find(w => w.path === '/api/run/start')).toBeTruthy()
  const payload = mock.writes.find(w => w.path === '/api/run/start')?.body as { port?: string }
  expect(payload.port).toBe('8090')
})

test('shows real modules and all three history status tiers', async ({ page }) => {
  await openRun(page)
  await page.locator('#page-run .page-toolbar button').last().click()
  await page.getByText('📋 运行历史').click()

  const table = page.getByRole('region', { name: '本地运行历史' })
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') })
  await expect(table).toBeVisible()
  await expect(rows).toHaveCount(3)
  // F1：旧实现读错字段名，模块列恒为「—」
  await expect(rows.filter({ hasText: 'b8seed-portal' })).toContainText('home, admin')
  await expect(rows.filter({ hasText: 'b8seed-shop' })).toContainText('dashboard')
  await expect(rows.filter({ hasText: 'b8seed-blog' })).toContainText('—')
  // F2：旧实现把 stopped 改写成 success，「手动停止」这档永远走不到
  await expect(rows.filter({ hasText: 'b8seed-portal' })).toContainText('已结束')
  await expect(rows.filter({ hasText: 'b8seed-blog' })).toContainText('手动停止')
  await expect(rows.filter({ hasText: 'b8seed-shop' })).toContainText('异常退出')
})

test('renders groups with collapse and ordering, ungrouped last', async ({ page }) => {
  const grouped = buildProjects()
  grouped[0].groupName = '业务前台'
  grouped[1].groupName = '内容站'
  await mockRun(page, grouped)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()

  const groups = page.locator('#page-run .run-group')
  await expect(groups).toHaveCount(3)
  // 「未分组」始终排在末尾且没有排序/重命名操作
  await expect(groups.last().locator('.run-group__name')).toHaveText('未分组')
  await expect(groups.last().locator('.run-group__ops button')).toHaveCount(0)
  await expect(groups.first().locator('.run-group__ops button')).toHaveCount(3)

  const first = groups.first()
  await expect(first.locator('.run-group__body')).toBeVisible()
  const disclosure = first.locator('button[aria-expanded]')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(first.locator('.run-group__body')).toBeHidden()
  // 折叠态存 localStorage，纯视图偏好不入库
  const collapsed = await page.evaluate(() => localStorage.getItem('runCollapsedGroups'))
  expect(collapsed).toBeTruthy()
})

test('shows the log viewer on top of the run page, not trapped in the home host', async ({ page }) => {
  const mock = await mockRun(page)
  mock.setStatuses([buildJob()])
  await page.route('**/api/run/*/logs', route => fulfill(route, {
    ...buildJob(),
    logs: [
      { text: '$ npm run dev', type: 'cmd', time: Date.now() },
      { text: 'ready in 340ms', type: 'info', time: Date.now() },
    ],
  }))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()

  const card = page.locator('.run-card[data-project="b8seed-portal"]')
  await expect(card).toHaveClass(/project-card--running/)
  await card.getByRole('button', { name: '更多操作' }).click()
  await page.getByText('查看日志', { exact: true }).click()

  /*
   * MigrationHost 挂在 #page-home 内，而 .page 非激活时是 display:none !important。
   * 外壳必须走 BaseDialog（NModal 自带 teleport 到 body）；自建 position:fixed
   * 覆盖层会留在原地，导致在本地运行页「点了没反应」——弹窗其实渲染了但宿主不可见。
   */
  const stack = page.locator('.log-viewer__stack')
  await expect(stack).toBeVisible()
  // 必须由 NModal 承载，且不能残留手写覆盖层
  await expect(page.locator('.n-modal .log-viewer__stack')).toHaveCount(1)
  await expect(page.locator('.log-viewer__mask, .log-viewer__panel')).toHaveCount(0)

  const trappedInPage = await stack.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement
    while (node) {
      if (node.classList?.contains('page')) return node.id || 'unknown-page'
      node = node.parentElement
    }
    return null
  })
  expect(trappedInPage).toBeNull()

  // 尺寸用 offsetWidth：开场动画的 transform 会让 boundingBox 量到中途值
  const size = await stack.evaluate((el) => {
    const card = (el as HTMLElement).closest('.n-card') as HTMLElement
    return { width: card.offsetWidth, height: card.offsetHeight }
  })
  expect(size.width).toBeGreaterThan(600)
  expect(size.height).toBeGreaterThan(200)

  await expect(page.locator('.log-viewer__line')).toHaveCount(2)
  await expect(stack).toContainText('npm run dev')
})

test('renders both themes at 900 by 600 without overflow', async ({ page }) => {
  await openRun(page, { width: 900, height: 600 })
  await expectNoPageOverflow(page)
  await page.evaluate(() => document.body.setAttribute('data-theme', 'light'))
  await expectNoPageOverflow(page)
  await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'))
})

test('keeps every project card the same height regardless of run state', async ({ page }) => {
  const mock = await mockRun(page)
  // 同一分组内同时出现运行中、启动中与空闲三种状态
  mock.setStatuses([
    buildJob({ id: 'run-a', projectName: 'b8seed-portal', status: 'running' }),
    buildJob({ id: 'run-b', projectName: 'b8seed-blog', status: 'starting', pid: null, url: '', port: 0 }),
  ])
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()
  await expect(page.locator('.run-card')).toHaveCount(3)

  const heights = await page.locator('.run-card').evaluateAll(
    cards => cards.map(card => Math.round(card.getBoundingClientRect().height)),
  )
  expect(new Set(heights).size).toBe(1)

  // 三种状态都渲染贴底状态便签，行数一致才是等高的根因
  await expect(page.locator('.run-card .project-card__footnote')).toHaveCount(3)
})

test('drops the boxed command and status panels from project cards', async ({ page }) => {
  await openRun(page)
  const card = page.locator('.run-card[data-project="b8seed-portal"]')

  // 状态贴底一行便签 + 顶部状态徽标，不再是带边框的独立面板
  await expect(card.locator('.project-card__footnote')).toHaveCount(1)
  await expect(card.locator('.base-badge')).toHaveCount(1)

  /*
    卡片内部不应再出现「满宽带边框的展示型容器」——旧实现的命令框和状态框就是，
    它们和卡片自身的边界叠成框中框。判定加上宽度条件：
    工具版本徽标、类型徽标这类内联小标签有边框是排版手段，不算嵌套容器。
  */
  const boxed = await card.evaluate((el) => {
    const cardWidth = el.getBoundingClientRect().width
    return [...el.querySelectorAll('*')]
      .filter(node => !node.closest('button') && node.tagName !== 'BUTTON')
      .filter((node) => {
        const style = getComputedStyle(node)
        const framed = style.borderTopStyle === 'solid'
          && Number.parseFloat(style.borderTopWidth) > 0
          && Number.parseFloat(style.borderBottomWidth) > 0
          && Number.parseFloat(style.borderLeftWidth) > 0
        // 只有接近卡片宽度的容器才构成框中框
        return framed && node.getBoundingClientRect().width > cardWidth * 0.6
      })
      .map(node => node.className)
  })
  expect(boxed).toEqual([])

  // redesign-v2：卡片收敛到共享 ProjectCard 基座（与部署面板同基座，跨页等高）
  await expect(card).toHaveClass(/project-card/)
})

test('wraps each group and its cards in one shared panel boundary', async ({ page }) => {
  const grouped = buildProjects()
  grouped[0].groupName = '业务前台'
  grouped[1].groupName = '业务前台'
  await mockRun(page, grouped)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="run"]').click()
  const group = page.locator('#page-run .run-group').first()
  await expect(group.locator('.run-card')).toHaveCount(2)

  // 分组用公共折叠组件的 panel 分区容器，而不是裸标题
  await expect(group).toHaveClass(/base-disclosure--panel/)

  // 标题与卡片网格同属一个容器，卡片不会脱出面板边界
  const nested = await group.evaluate((el) => {
    const body = el.querySelector('.run-group__body')!
    const card = body.querySelector('.run-card')!
    const groupRect = el.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    return {
      cardInsidePanel: cardRect.left >= groupRect.left && cardRect.right <= groupRect.right,
      // 卡片圆角必须比容器小一档，嵌套关系才成立
      groupRadius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius),
      cardRadius: Number.parseFloat(getComputedStyle(card).borderTopLeftRadius),
    }
  })
  expect(nested.cardInsidePanel).toBe(true)
  expect(nested.cardRadius).toBeLessThan(nested.groupRadius)
})
