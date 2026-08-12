import { expect, test, type Page, type Route } from '@playwright/test'

/** 固定 expiresAt 相对当前时间，保证倒计时始终处于可预期区间 */
function buildAccounts() {
  const expiresAt = Date.now() + 18_000
  return [
    {
      id: 'twofa-github', issuer: 'GitHub', accountName: 'ldy@example.com', tag: '主账号',
      groupName: '开发', algorithm: 'SHA1', period: 30, digits: 6, favorite: true,
      lastUsedAt: 1785300000, sortOrder: 0, createdAt: 1785300000, updatedAt: 1785300000,
      secretMasked: 'JBSW••••••••3PXP', secretTail: '3PXP',
      currentCode: '963253', remainingSeconds: 18, expiresAt,
    },
    {
      id: 'twofa-aws', issuer: 'AWS', accountName: 'root-account-very-long-name@company-domain.com', tag: '生产环境',
      groupName: '开发', algorithm: 'SHA1', period: 30, digits: 6, favorite: false,
      lastUsedAt: 0, sortOrder: 1, createdAt: 1785300000, updatedAt: 1785300000,
      secretMasked: 'MZXW••••••••====', secretTail: '====',
      currentCode: '298611', remainingSeconds: 18, expiresAt,
    },
    {
      id: 'twofa-ms', issuer: 'Microsoft', accountName: 'azure@example.com', tag: '',
      groupName: '开发', algorithm: 'SHA256', period: 60, digits: 8, favorite: false,
      lastUsedAt: 0, sortOrder: 2, createdAt: 1785300000, updatedAt: 1785300000,
      secretMasked: 'IFBE••••••••QSKK', secretTail: 'QSKK',
      currentCode: '25575772', remainingSeconds: 40, expiresAt: Date.now() + 40_000,
    },
    {
      id: 'twofa-google', issuer: 'Google', accountName: 'personal@gmail.com', tag: '',
      groupName: '个人', algorithm: 'SHA1', period: 30, digits: 6, favorite: true,
      lastUsedAt: 0, sortOrder: 3, createdAt: 1785300000, updatedAt: 1785300000,
      secretMasked: 'KRSX••••••••EZLU', secretTail: 'EZLU',
      currentCode: '108191', remainingSeconds: 18, expiresAt,
    },
    {
      id: 'twofa-dingtalk', issuer: '钉钉', accountName: '工作账号', tag: '',
      groupName: '其他', algorithm: 'SHA1', period: 30, digits: 6, favorite: false,
      lastUsedAt: 0, sortOrder: 4, createdAt: 1785300000, updatedAt: 1785300000,
      secretMasked: 'GEZD••••••••QOJQ', secretTail: 'QOJQ',
      currentCode: '405075', remainingSeconds: 18, expiresAt,
    },
  ]
}

const stats = { total: 5, favorites: 2, groups: { 开发: 3, 个人: 1, 其他: 1 } }

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockTwofa(page: Page) {
  const requests: string[] = []
  const writes: Array<{ method: string; path: string; body: unknown }> = []
  await page.route('**/api/twofa/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    requests.push(`${method} ${path}`)

    if (method === 'GET' && path === '/api/twofa/accounts') {
      return fulfill(route, { accounts: buildAccounts(), stats })
    }
    if (method === 'POST' && path === '/api/twofa/preview') {
      writes.push({ method, path, body: request.postDataJSON() })
      return fulfill(route, {
        code: '456123', remainingSeconds: 22, expiresAt: Date.now() + 22_000,
        algorithm: 'SHA1', period: 30, digits: 6, issuer: 'Acme', accountName: 'bob@example.com',
      })
    }
    if (method === 'POST' && path === '/api/twofa/import') {
      writes.push({ method, path, body: request.postDataJSON() })
      return fulfill(route, { created: 2, updated: 0, total: 7 })
    }
    if (method === 'POST' && path.endsWith('/touch')) {
      writes.push({ method, path, body: null })
      return fulfill(route, { success: true, lastUsedAt: 1785300000 })
    }
    if (method === 'POST' && path === '/api/twofa/accounts') {
      writes.push({ method, path, body: request.postDataJSON() })
      return fulfill(route, buildAccounts()[0])
    }
    if (method === 'PUT' && path.startsWith('/api/twofa/accounts/')) {
      writes.push({ method, path, body: request.postDataJSON() })
      return fulfill(route, buildAccounts()[0])
    }
    if (method === 'DELETE' && path.startsWith('/api/twofa/accounts/')) {
      writes.push({ method, path, body: null })
      return fulfill(route, { success: true })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"未模拟"}' })
  })
  return { requests, writes }
}

async function openTwofa(page: Page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport)
  const mock = await mockTwofa(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="twofa"]').click()
  await expect(page.getByRole('heading', { name: '双因验证', exact: true })).toBeVisible()
  await expect(page.locator('.twofa-row-shell')).toHaveCount(5)
  // 账号卡片用线形倒计时，常用卡片保留圆环
  await expect(page.locator('.twofa-row__bar.base-progress--line')).toHaveCount(5)
  await expect(page.locator('.twofa-countdown.base-progress--circle')).toHaveCount(2)
  return mock
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.locator('#page-twofa').evaluate((activePage) => {
    // P8 后 RouterView 根即 View 根：#page-twofa 与 .twofa-view 是同一元素
    const view = activePage.matches('.twofa-view') ? activePage : activePage.querySelector('.twofa-view')
    return {
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageX: activePage.scrollWidth > activePage.clientWidth,
      viewX: view ? view.scrollWidth > view.clientWidth + 1 : true,
      rowX: [...activePage.querySelectorAll('.twofa-row-shell')].some((row) => row.scrollWidth > row.clientWidth + 1),
    }
  })
  expect(layout).toEqual({ documentX: false, pageX: false, viewX: false, rowX: false })
}

test('mounts one Vue twofa page without the retired DOM or scripts', async ({ page }) => {
  await openTwofa(page)
  await expect(page.locator('#page-twofa')).toHaveCount(1)
  await expect(page.locator('.twofa-view')).toHaveCount(1)
  await expect(page.locator('.twofa-layout, .twofa-detail-card, #twofaGroupBlocks')).toHaveCount(0)
  await expect(page.locator('script[src="js/twofa.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/twofa.css"]')).toHaveCount(0)
  // 旧实现的固定右栏已被行内展开取代
  await expect(page.locator('#twofaAccountModal, #twofaImportModal')).toHaveCount(0)
  await expectNoPageOverflow(page)
})

test('keeps codes readable in both themes at 900 by 600', async ({ page }) => {
  await openTwofa(page, { width: 900, height: 600 })
  await expectNoPageOverflow(page)
  await page.evaluate(() => document.body.setAttribute('data-theme', 'light'))
  await expectNoPageOverflow(page)
  // 窄窗口下常用卡片的发行方名与验证码都不能被截断
  const clipped = await page.locator('.twofa-pinned__card').evaluateAll((cards) => cards.some((card) => {
    const issuer = card.querySelector('.twofa-pinned__issuer')
    const code = card.querySelector('.twofa-pinned__code')
    return !issuer || !code
      || issuer.scrollWidth > issuer.clientWidth + 1
      || code.scrollWidth > code.clientWidth + 1
  }))
  expect(clipped).toBe(false)
  await page.evaluate(() => document.body.setAttribute('data-theme', 'dark'))
})

test('uses structured three-column entity cards on wide windows', async ({ page }) => {
  await openTwofa(page, { width: 1600, height: 900 })
  const development = page.locator('.twofa-group').filter({ hasText: '开发' })
  const layout = await development.locator('.twofa-group__rows').evaluate((grid) => {
    const rows = [...grid.querySelectorAll('.twofa-row-shell')]
    const gridRect = grid.getBoundingClientRect()
    const rects = rows.map(row => row.getBoundingClientRect())
    return {
      gridWidth: Math.round(gridRect.width),
      rowWidths: rects.map(rect => Math.round(rect.width)),
      rowTops: rects.map(rect => Math.round(rect.top)),
    }
  })
  expect(layout.rowWidths).toHaveLength(3)
  expect(layout.rowWidths[0]).toBeLessThan(layout.gridWidth * 0.45)
  expect(layout.rowTops[0]).toBe(layout.rowTops[1])
  expect(layout.rowTops[1]).toBe(layout.rowTops[2])
  await expect(development.locator('.twofa-row-shell.base-entity-card')).toHaveCount(3)
  await expectNoPageOverflow(page)
})

test('keeps the countdown line flush with the card and status out of a boxed panel', async ({ page }) => {
  await openTwofa(page, { width: 1600, height: 900 })
  const row = page.locator('.twofa-row-shell').filter({ hasText: 'GitHub' })
  // 周期说明留在底部说明位，不再是带边框的独立状态面板
  await expect(row.locator('.base-entity-card__status')).toHaveCount(0)
  await expect(row.locator('.base-entity-card__footer-status')).toHaveText('30 秒周期 · 本机生成')
  // 进度线要贯通到卡片内容宽度，不能只占左侧一段
  const bar = await row.evaluate((shell) => {
    const body = shell.querySelector('.base-entity-card__body')!
    const track = shell.querySelector('.twofa-row__bar')!
    const bodyStyle = getComputedStyle(body)
    const inner = body.clientWidth
      - Number.parseFloat(bodyStyle.paddingLeft) - Number.parseFloat(bodyStyle.paddingRight)
    return { inner: Math.round(inner), track: Math.round(track.getBoundingClientRect().width) }
  })
  expect(bar.track).toBe(bar.inner)
})

test('expanding one card does not stretch its siblings', async ({ page }) => {
  await openTwofa(page, { width: 1600, height: 900 })
  const development = page.locator('.twofa-group').filter({ hasText: '开发' })
  const before = await development.locator('.twofa-row-shell').first().evaluate(
    (row) => Math.round(row.getBoundingClientRect().height),
  )
  await development.locator('.twofa-row-shell').filter({ hasText: 'Microsoft' })
    .locator('.base-entity-card__details-trigger').click()
  await expect(page.locator('.twofa-row-shell.is-open')).toHaveCount(1)
  const after = await development.locator('.twofa-row-shell').first().evaluate(
    (row) => Math.round(row.getBoundingClientRect().height),
  )
  // 展开是卡片内联行为，同排未展开的卡片不应被拉高留出空白
  expect(after).toBe(before)
})

test('filters accounts by keyword and by group', async ({ page }) => {
  await openTwofa(page)
  const search = page.locator('.twofa-toolbar__search input')

  await search.fill('aws')
  await expect(page.locator('.twofa-row-shell')).toHaveCount(1)
  await expect(page.locator('.twofa-row__issuer')).toHaveText('AWS')
  // 搜索时常用区隐藏，避免与筛选结果冲突
  await expect(page.locator('.twofa-pinned__card')).toHaveCount(0)

  await search.fill('生产环境')
  await expect(page.locator('.twofa-row__issuer')).toHaveText('AWS')

  await search.fill('zzzz')
  await expect(page.locator('.twofa-row-shell')).toHaveCount(0)

  await search.fill('')
  await expect(page.locator('.twofa-row-shell')).toHaveCount(5)

  await page.getByRole('button', { name: '筛选开发，3 个账号' }).click()
  await expect(page.locator('.twofa-row-shell')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '筛选开发，3 个账号' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '筛选全部，5 个账号' }).click()
  await expect(page.locator('.twofa-row-shell')).toHaveCount(5)
})

test('reveals account detail inline instead of in a fixed side panel', async ({ page }) => {
  await openTwofa(page)
  const row = page.locator('.twofa-row-shell').filter({ hasText: 'Microsoft' })
  const detailsTrigger = row.locator('.base-entity-card__details-trigger')
  await detailsTrigger.click()

  await expect(page.locator('.twofa-row-shell.is-open')).toHaveCount(1)
  const detail = row.locator('.twofa-detail')
  await expect(detail).toBeVisible()
  // 8 位 / 60 秒周期的账号信息要正确显示
  await expect(detail).toContainText('SHA256 · 8 位')
  await expect(detail).toContainText('60 秒')
  await expect(detail).toContainText('IFBE••••••••QSKK')

  // 详情必须紧贴所属行，而不是被推到列表末尾
  const gap = await row.evaluate((shell) => {
    const headerRect = shell.querySelector('.base-entity-card__footer')!.getBoundingClientRect()
    const detailRect = shell.querySelector('.twofa-detail')!.getBoundingClientRect()
    return detailRect.top - headerRect.bottom
  })
  expect(Math.abs(gap)).toBeLessThan(4)

  await detailsTrigger.click()
  await expect(page.locator('.twofa-row-shell.is-open')).toHaveCount(0)
})

test('uses project disclosures for groups without nested interactive controls', async ({ page }) => {
  await openTwofa(page)
  const groups = page.locator('.twofa-group.base-disclosure')
  await expect(groups).toHaveCount(3)

  const development = groups.filter({ hasText: '开发' })
  const trigger = development.locator('.base-disclosure__trigger').first()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger.locator('button, [role="button"]')).toHaveCount(0)
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(development.locator('.twofa-row-shell:visible')).toHaveCount(0)
  await trigger.click()
  await expect(development.locator('.twofa-row-shell:visible')).toHaveCount(3)
})

test('no longer offers exporting plaintext secrets', async ({ page }) => {
  await openTwofa(page)
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0)
})

test('looks up a code for an unsaved secret without storing it', async ({ page }) => {
  const mock = await openTwofa(page)
  await page.getByRole('button', { name: '快捷查询', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('input').first().fill('JBSWY3DPEHPK3PXP')
  await dialog.getByRole('button', { name: '查询验证码', exact: true }).click()

  await expect(dialog.locator('.twofa-quick__code')).toHaveText('456 123')
  await expect(dialog).toContainText('SHA1 · 6 位 · 30 秒周期')

  // 查询只调用 preview，绝不写入账号表
  const preview = mock.writes.find((write) => write.path === '/api/twofa/preview')
  expect(preview?.body).toMatchObject({ secret: 'JBSWY3DPEHPK3PXP' })
  expect(mock.writes.some((write) => write.method === 'POST' && write.path === '/api/twofa/accounts')).toBe(false)
})

test('asks for confirmation in-app before deleting an account', async ({ page }) => {
  const mock = await openTwofa(page)
  const row = page.locator('.twofa-row-shell').filter({ hasText: 'GitHub' })
  await row.locator('.base-entity-card__details-trigger').click()
  await row.getByRole('button', { name: '删除', exact: true }).click()

  // 必须是应用内确认弹窗：Tauri WebView 会禁用原生 confirm
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('删除这个 2FA 账号')
  expect(mock.writes.some((write) => write.method === 'DELETE')).toBe(false)

  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(mock.writes.some((write) => write.method === 'DELETE')).toBe(false)

  await row.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除账号', exact: true }).click()
  await expect.poll(() => mock.writes.some((write) => write.method === 'DELETE')).toBe(true)
})

test('lets a brand new group be typed in rather than only picked', async ({ page }) => {
  const mock = await openTwofa(page)
  await page.getByRole('button', { name: '添加账号', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('发行方').fill('Vercel')
  await dialog.getByLabel('账号名').fill('deploy@example.com')
  await dialog.getByLabel('密钥').fill('JBSWY3DPEHPK3PXP')
  // 已有分组只是快捷入口，分组名必须能自由输入
  await dialog.getByLabel('分组').fill('运维值班')
  await dialog.getByRole('button', { name: '添加', exact: true }).click()

  await expect.poll(() => mock.writes.some((write) => write.method === 'POST' && write.path === '/api/twofa/accounts')).toBe(true)
  const payload = mock.writes.find((write) => write.path === '/api/twofa/accounts')?.body as { groupName?: string }
  expect(payload.groupName).toBe('运维值班')
})

test('drops the tag field from the form but keeps existing tags on rows', async ({ page }) => {
  await openTwofa(page)
  await page.getByRole('button', { name: '添加账号', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // 标签编辑已移除
  await expect(dialog.getByLabel('标签')).toHaveCount(0)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()

  // 但导入带来的既有标签仍要显示，不能默默丢数据
  await expect(page.locator('.twofa-row__tag').filter({ hasText: '生产环境' })).toBeVisible()
})

test('imports otpauth links through the parsed preview', async ({ page }) => {
  const mock = await openTwofa(page)
  await page.getByRole('button', { name: '批量导入', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill([
    'otpauth://totp/GitHub:new@example.com?secret=AAAABBBB&issuer=GitHub',
    'otpauth://totp/AWS:ops@example.com?secret=CCCCDDDD&issuer=AWS&period=60',
  ].join('\n'))
  await expect(dialog).toContainText('已解析 2 个账号')

  await dialog.getByRole('button', { name: /^导入/ }).click()
  await expect.poll(() => mock.writes.some((write) => write.path === '/api/twofa/import')).toBe(true)
  const payload = mock.writes.find((write) => write.path === '/api/twofa/import')?.body as { accounts?: unknown[] }
  expect(payload.accounts).toHaveLength(2)
})
