import { expect, test, type Page } from '@playwright/test'

interface MockTodo {
  id: string
  title: string
  content: string
  status: 'todo' | 'doing' | 'done'
  remindAt: string
  createdAt: string
  updatedAt: string
}

async function mockTodos(page: Page) {
  const timestamp = '2026-07-29T02:00:00.000Z'
  const todos: MockTodo[] = [
    {
      id: 'todo-one',
      title: '整理 Vue 迁移清单',
      content: '梳理正式迁移范围\n[checklist]\n- [ ] 检查数据兼容\n- [x] 完成原型确认',
      status: 'todo',
      remindAt: '2026-07-29T10:00:00.000Z',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'todo-two',
      title: '检查发布脚本',
      content: '验证构建产物',
      status: 'doing',
      remindAt: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'todo-three',
      title: '升级依赖包',
      content: '',
      status: 'done',
      remindAt: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]
  const writes: Array<{ id: string; input: Partial<MockTodo> }> = []

  await page.route('**/api/todos**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (path === '/api/todos' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(todos) })
      return
    }

    if (path === '/api/todos' && method === 'POST') {
      const input = request.postDataJSON() as Partial<MockTodo>
      const created: MockTodo = {
        id: `todo-${todos.length + 1}`,
        title: input.title ?? '',
        content: input.content ?? '',
        status: input.status ?? 'todo',
        remindAt: input.remindAt ?? '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      todos.unshift(created)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) })
      return
    }

    if (path === '/api/todos' && method === 'DELETE') {
      const count = todos.filter((todo) => todo.status === 'done').length
      for (let index = todos.length - 1; index >= 0; index -= 1) {
        if (todos[index].status === 'done') todos.splice(index, 1)
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, deleted: count }),
      })
      return
    }

    const match = path.match(/^\/api\/todos\/([^/]+)$/)
    if (match && method === 'PUT') {
      const todo = todos.find((item) => item.id === match[1])
      const input = request.postDataJSON() as Partial<MockTodo>
      if (!todo) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"任务不存在"}' })
        return
      }
      Object.assign(todo, input, { updatedAt: timestamp })
      writes.push({ id: todo.id, input })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(todo) })
      return
    }

    if (match && method === 'DELETE') {
      const index = todos.findIndex((item) => item.id === match[1])
      if (index >= 0) todos.splice(index, 1)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"未模拟"}' })
  })

  return { todos, writes }
}

async function openTodo(page: Page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport)
  const mock = await mockTodos(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="todo"]').click()
  await expect(page.getByRole('heading', { name: '待办事项', exact: true })).toBeVisible()
  await expect(page.getByText('整理 Vue 迁移清单', { exact: true }).first()).toBeVisible()
  return mock
}

async function expectNoOverflow(page: Page) {
  const layout = await page.locator('#page-todo').evaluate((activePage) => {
    const workspace = activePage.querySelector('.todo-workspace')
    return {
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageX: activePage.scrollWidth > activePage.clientWidth,
      pageY: activePage.scrollHeight > activePage.clientHeight + 1,
      workspaceX: workspace ? workspace.scrollWidth > workspace.clientWidth + 1 : true,
    }
  })
  expect(layout).toEqual({
    documentX: false,
    pageX: false,
    pageY: false,
    workspaceX: false,
  })
}

test('mounts one Vue todo page in both themes without the retired runtime', async ({ page }) => {
  await openTodo(page)

  await expect(page.locator('#vue-todo-host[data-vue-owner="todo"]')).toHaveCount(1)
  await expect(page.locator('#vue-todo-host .todo-view')).toHaveCount(1)
  await expect(page.locator('#todoLayoutContainer')).toHaveCount(0)
  await expect(page.locator('script[src="js/todo.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/todo.css"]')).toHaveCount(0)
  await expect(page.locator('.todo-group .base-disclosure__trigger')).toHaveCount(3)
  await expect(page.locator('.todo-task-row[aria-pressed="true"]')).toHaveCount(1)
  await expect(page.locator('.todo-task-row button')).toHaveCount(0)
  const todoGroupTrigger = page.locator('[data-test="todo-group-todo"] .base-disclosure__trigger')
  await expect(todoGroupTrigger).toHaveAttribute('aria-expanded', 'true')
  await todoGroupTrigger.click()
  await expect(todoGroupTrigger).toHaveAttribute('aria-expanded', 'false')
  await todoGroupTrigger.click()
  await expect(todoGroupTrigger).toHaveAttribute('aria-expanded', 'true')
  expect(await page.evaluate(() => ({
    loadTodos: typeof (window as typeof window & { loadTodos?: unknown }).loadTodos,
    showAddTodo: typeof (window as typeof window & { showAddTodo?: unknown }).showAddTodo,
  }))).toEqual({ loadTodos: 'undefined', showAddTodo: 'undefined' })
  await expectNoOverflow(page)

  await page.locator('#themeModeToggle').click()
  await page.locator('#themeModeMenu [data-theme-mode="dark"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectNoOverflow(page)
})

test('keeps list and detail as a usable master-detail flow at 900 by 600', async ({ page }) => {
  await openTodo(page, { width: 900, height: 600 })
  await expectNoOverflow(page)
  await page.getByText('检查发布脚本', { exact: true }).first().click()
  await expect(page.getByRole('button', { name: '返回任务列表', exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('检查发布脚本')
  await expectNoOverflow(page)

  await page.getByRole('button', { name: '返回任务列表', exact: false }).click()
  await expect(page.getByText('整理 Vue 迁移清单', { exact: true }).first()).toBeVisible()
})

test('searches, filters, creates and auto-saves the legacy-compatible content', async ({ page }) => {
  const mock = await openTodo(page)

  await page.getByRole('searchbox', { name: '搜索待办任务' }).fill('数据兼容')
  await expect(page.locator('.todo-task-row')).toHaveCount(1)
  await page.getByRole('searchbox', { name: '搜索待办任务' }).fill('')

  await page.getByRole('button', { name: '新建任务', exact: false }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('任务标题').fill('新增正式任务')
  await dialog.getByLabel('任务描述').fill('验证 Vue 创建流程')
  await dialog.getByRole('button', { name: '创建任务', exact: true }).click()
  const detail = page.locator('.todo-detail')
  await expect(detail.getByRole('textbox', { name: '任务标题' })).toHaveValue('新增正式任务')

  await detail.getByPlaceholder('补充目标、背景或完成标准').fill('保存新的描述')
  await detail.getByRole('button', { name: '暂无子任务，点击添加第一项', exact: true }).click()
  await detail.getByPlaceholder('输入子任务内容').fill('第一条子任务')
  await expect.poll(() => mock.writes.length).toBeGreaterThan(0)
  await expect.poll(() => mock.writes.at(-1)?.input.content).toBe(
    '保存新的描述\n[checklist]\n- [ ] 第一条子任务',
  )
})

test('confirms incomplete child tasks before completing a parent and clears done tasks', async ({ page }) => {
  const mock = await openTodo(page)

  await page.getByRole('button', { name: '开始执行', exact: true }).click()
  await expect(page.getByRole('button', { name: '完成任务', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '完成任务', exact: true }).click()
  await expect(page.getByText('仍有子任务未完成', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '全部完成', exact: true }).click()
  await expect.poll(() => mock.writes.at(-1)?.input.status).toBe('done')
  expect(mock.writes.at(-1)?.input.content).toContain('- [x] 检查数据兼容')

  await page.getByRole('button', { name: '清除已完成', exact: true }).click()
  await page.getByRole('button', { name: '全部清除', exact: true }).click()
  await expect(page.getByText('升级依赖包', { exact: true })).toHaveCount(0)
})
