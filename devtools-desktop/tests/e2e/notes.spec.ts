import { expect, test, type Page } from '@playwright/test'

function localDate(value = new Date()) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

async function mockNotes(page: Page, options: { failLoads?: boolean } = {}) {
  const writes: Array<{ date: string; title: string; content: string }> = []
  let failLoads = Boolean(options.failLoads)

  await page.route('**/api/notes/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    if (failLoads) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '测试服务异常' }) })
      return
    }
    const date = route.request().url().split('/').pop() ?? ''
    if (date === localDate()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date,
          title: '当前页面 Vue 迁移',
          content: '验证周工作空间和自动保存。',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: '该日期没有日志' }) })
  })

  await page.route('**/api/notes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON() as { date: string; title: string; content: string }
    writes.push(body)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...body, updatedAt: new Date().toISOString() }),
    })
  })

  await page.route('**/api/report/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-token',
        author: 'Ledy',
        outputDir: '',
        repos: [{
          repo: 'https://gitlab.example.com/personal/devtools-desktop.git',
          branch: 'main',
          group: '个人工具',
        }],
      }),
    })
  })

  await page.route('**/api/report/generate', async (route) => {
    const body = route.request().postDataJSON() as { since: string; until: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{
          project: 'personal/devtools-desktop',
          repo: 'https://gitlab.example.com/personal/devtools-desktop.git',
          branch: 'main',
          group: '个人工具',
          error: null,
          logs: [{
            date: localDate(),
            author: 'Ledy',
            subject: 'feat: 完成工时内容 Git 活动集成',
            hash: 'a1b2c3d',
          }],
        }],
        markdown: `# Git 仓库周报\n\n- 时间范围：${body.since} 至 ${body.until}`,
      }),
    })
  })

  return {
    writes,
    recoverLoads() {
      failLoads = false
    },
  }
}

async function openNotes(page: Page, options: { failLoads?: boolean } = {}) {
  const mock = await mockNotes(page, options)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="notes"]').click()
  await expect(page.getByRole('heading', { name: '工时内容', exact: true })).toBeVisible()
  return mock
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.locator('#page-notes').evaluate((activePage) => ({
    documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pageX: activePage.scrollWidth > activePage.clientWidth,
    pageY: activePage.scrollHeight > activePage.clientHeight + 1,
  }))
  expect(layout).toEqual({ documentX: false, pageX: false, pageY: false })
}

async function expectUsableEditor(page: Page) {
  const editor = await page.getByRole('textbox', { name: '工作内容' }).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const styles = getComputedStyle(element)
    const panel = element.closest('.notes-editor-panel')?.getBoundingClientRect()
    const field = element.closest('.field-control')?.getBoundingClientRect()
    const label = element.closest('.field-control')?.querySelector('label')?.getBoundingClientRect()
    const footer = element.closest('.notes-editor-panel')?.querySelector('.notes-editor-panel__footer')?.getBoundingClientRect()
    const visibleHeight = panel
      ? Math.max(0, Math.min(rect.bottom, panel.bottom, window.innerHeight) - Math.max(rect.top, panel.top, 0))
      : 0
    return {
      width: rect.width,
      height: rect.height,
      visibleHeight,
      paddingLeft: Number.parseFloat(styles.paddingLeft),
      paddingTop: Number.parseFloat(styles.paddingTop),
      labelGap: label ? rect.top - label.bottom : Number.POSITIVE_INFINITY,
      fieldBottomGap: field ? field.bottom - rect.bottom : Number.POSITIVE_INFINITY,
      footerGap: footer && footer.height > 0 ? footer.top - rect.bottom : null,
      resize: styles.resize,
    }
  })
  const title = await page.getByRole('textbox', { name: '项目 / 标题' }).evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      paddingLeft: Number.parseFloat(styles.paddingLeft),
      paddingRight: Number.parseFloat(styles.paddingRight),
    }
  })
  expect(editor.width).toBeGreaterThan(300)
  expect(editor.height).toBeGreaterThanOrEqual(70)
  expect(editor.visibleHeight).toBeGreaterThanOrEqual(70)
  expect(editor.paddingLeft).toBeGreaterThanOrEqual(12)
  expect(editor.paddingTop).toBeGreaterThanOrEqual(12)
  expect(title.paddingLeft).toBeGreaterThanOrEqual(12)
  expect(title.paddingRight).toBeGreaterThanOrEqual(12)
  expect(editor.labelGap).toBeGreaterThanOrEqual(0)
  expect(editor.labelGap).toBeLessThanOrEqual(16)
  expect(editor.fieldBottomGap).toBeGreaterThanOrEqual(-1)
  expect(editor.fieldBottomGap).toBeLessThanOrEqual(1)
  if (editor.footerGap !== null) {
    expect(editor.footerGap).toBeGreaterThanOrEqual(0)
    expect(editor.footerGap).toBeLessThanOrEqual(24)
  }
  expect(editor.resize).toBe('none')
}

test('renders the confirmed Vue workspace without the retired legacy implementation', async ({ page }) => {
  await page.setViewportSize({ width: 1665, height: 1184 })
  await page.emulateMedia({ colorScheme: 'light' })
  await openNotes(page)

  await expect(page.locator('#page-notes')).toHaveCount(1)
  await expect(page.locator('.notes-view')).toHaveCount(1)
  await expect(page.locator('.legacy-notes-fallback')).toHaveCount(0)
  await expect(page.locator('#notesWeekGrid')).toHaveCount(0)
  // 日行预览合并显示「标题 · 内容」（原型 .day-row .p），标题在编辑器内可编辑
  await expect(page.getByText('当前页面 Vue 迁移', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: '项目 / 标题' })).toHaveValue('当前页面 Vue 迁移')
  await expectNoPageOverflow(page)
  await expectUsableEditor(page)

  // P9-8：主题菜单已删，侧栏按钮循环 system→light→dark
  for (let i = 0; i < 3 && !(await page.locator('body[data-theme="dark"]').count()); i++) {
    await page.locator('[data-test="theme-toggle"]').click()
  }
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectNoPageOverflow(page)
})

test('keeps five-day, seven-day, and inline reference layouts usable at 900 by 600', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await openNotes(page)
  await expectNoPageOverflow(page)
  await expectUsableEditor(page)

  await page.getByRole('switch').click()
  await expect(page.locator('.notes-day-item')).toHaveCount(7)
  await expectNoPageOverflow(page)
  await expectUsableEditor(page)

  await page.getByRole('button', { name: 'Git 活动参考', exact: true }).click()
  const reference = page.getByRole('complementary', { name: 'Git 活动参考' })
  await expect(reference).toBeVisible()
  await expect(reference.getByText('feat: 完成工时内容 Git 活动集成', { exact: true })).toBeVisible()
  await expectNoPageOverflow(page)

  const inlineLayout = await page.locator('.notes-workspace').evaluate((workspace) => {
    const editor = workspace.querySelector('.notes-editor-panel')?.getBoundingClientRect()
    const panel = workspace.querySelector('.notes-reference-panel')?.getBoundingClientRect()
    const week = workspace.querySelector('.notes-week-panel')?.getBoundingClientRect()
    return {
      workspaceOpen: workspace.classList.contains('is-reference-open'),
      editorWidth: editor?.width ?? 0,
      noOverlap: Boolean(editor && panel && editor.right <= panel.left + 1),
      weekAbove: Boolean(week && editor && week.bottom <= editor.top + 1),
      panelInside: Boolean(panel && panel.right <= workspace.getBoundingClientRect().right + 1),
    }
  })
  expect(inlineLayout).toMatchObject({
    workspaceOpen: true,
    noOverlap: true,
    weekAbove: true,
    panelInside: true,
  })
  expect(inlineLayout.editorWidth).toBeGreaterThan(275)

  await page.getByRole('textbox', { name: '工作内容' }).click()
  await expect(reference).toBeVisible()

  const secondDay = page.locator('.notes-day-item').nth(1)
  await secondDay.click()
  await expect(reference).toBeVisible()

  await reference.locator('.side-panel__body').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await reference.getByRole('checkbox', { name: '选择提交：feat: 完成工时内容 Git 活动集成' }).check()
  await reference.getByLabel('批量写入方式').click()
  await page.getByText('写入目标日期', { exact: true }).click()
  await reference.getByRole('button', { name: '加入所选', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '工作内容' })).toHaveValue(/完成工时内容 Git 活动集成/)
  await expect(page.getByRole('textbox', { name: '工作内容' })).not.toHaveValue(/代码活动参考/)
  await expect(page.getByRole('textbox', { name: '工作内容' })).not.toHaveValue(/a1b2c3d/)
  await expect(page.getByRole('textbox', { name: '工作内容' })).not.toHaveValue(/devtools-desktop/)
  await expect(page.getByRole('textbox', { name: '工作内容' })).not.toHaveValue(/^feat:/m)
  await reference.getByRole('button', { name: '撤销上次', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '工作内容' })).not.toHaveValue(/完成工时内容 Git 活动集成/)

  await reference.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(reference).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Git 活动参考', exact: true })).toBeVisible()
  await expectNoPageOverflow(page)
})

test('auto-saves after 800ms and flushes immediately when selecting another date', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const mock = await openNotes(page)
  const title = page.getByRole('textbox', { name: '项目 / 标题' })
  const content = page.getByRole('textbox', { name: '工作内容' })

  await title.fill('PG4 Vue 实现')
  await content.fill('完成 Notes 自动保存。')
  await expect.poll(() => mock.writes.length).toBe(1)
  expect(mock.writes[0]).toMatchObject({
    date: localDate(),
    title: 'PG4 Vue 实现',
    content: '完成 Notes 自动保存。',
  })

  await content.fill('切换日期前也必须保存。')
  const secondDay = page.locator('.notes-day-item').nth(1)
  await secondDay.click()
  await expect.poll(() => mock.writes.length).toBe(2)
  expect(mock.writes[1]).toMatchObject({
    date: localDate(),
    content: '切换日期前也必须保存。',
  })
})

test('distinguishes load failures from empty dates and supports retry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const mock = await openNotes(page, { failLoads: true })

  await expect(page.getByText('当天记录加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('部分记录加载失败', { exact: true })).toBeVisible()
  mock.recoverLoads()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()

  await expect(page.getByRole('textbox', { name: '工作内容' })).toBeVisible()
  await expect(page.getByText('当天记录加载失败', { exact: true })).toHaveCount(0)
})

test('preserves the active week and selected draft across page navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const mock = await openNotes(page)
  await page.getByRole('button', { name: '下一周 ›', exact: true }).click()
  await page.getByRole('textbox', { name: '工作内容' }).fill('下周会话草稿')

  await page.locator('.sidebar-item[data-page="home"]').click()
  await expect.poll(() => mock.writes.some((write) => write.content === '下周会话草稿')).toBe(true)
  await page.locator('.sidebar-item[data-page="notes"]').click()

  await expect(page.getByRole('textbox', { name: '工作内容' })).toHaveValue('下周会话草稿')
  await expect(page.getByRole('button', { name: '回到本周', exact: true })).toBeVisible()
})
