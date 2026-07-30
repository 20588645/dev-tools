import { expect, test, type Page } from '@playwright/test'

interface MockNote {
  id: string
  title: string
  content: string
  pinned: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function summary(note: MockNote) {
  return {
    id: note.id,
    title: note.title,
    preview: note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
    pinned: note.pinned,
    sortOrder: note.sortOrder,
    hasMedia: /<img\b/i.test(note.content),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

async function mockNotebook(page: Page) {
  const timestamp = '2026-07-28T06:00:00.000Z'
  const notes: MockNote[] = [
    {
      id: 'note-one',
      title: '系统凭据',
      content: '<p>只使用公开模拟数据。</p><p>https://example.com/</p>',
      pinned: true,
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'note-two',
      title: '日常备忘',
      content: '<p>第二篇笔记内容。</p>',
      pinned: false,
      sortOrder: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]
  const writes: Array<{ id: string; title: string; content: string; pinned: boolean }> = []

  await page.route('**/api/notebook**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/api/notebook/tags/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }

    if (path === '/api/notebook' && method === 'GET') {
      const query = (url.searchParams.get('search') ?? '').toLowerCase()
      const result = notes.filter((note) => !query || `${note.title} ${note.content}`.toLowerCase().includes(query))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result.map(summary)),
      })
      return
    }

    if (path === '/api/notebook' && method === 'POST') {
      const body = request.postDataJSON() as { title?: string; content?: string }
      const created: MockNote = {
        id: `note-${notes.length + 1}`,
        title: body.title ?? '',
        content: body.content ?? '',
        pinned: false,
        sortOrder: notes.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      notes.unshift(created)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...summary(created), content: created.content }),
      })
      return
    }

    if (path === '/api/notebook/reorder' && method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      return
    }

    const match = path.match(/^\/api\/notebook\/([^/]+)$/)
    if (match && method === 'GET') {
      const note = notes.find((item) => item.id === match[1])
      await route.fulfill({
        status: note ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(note ? { ...summary(note), content: note.content } : { error: '笔记不存在' }),
      })
      return
    }

    if (match && method === 'PUT') {
      const note = notes.find((item) => item.id === match[1])
      const body = request.postDataJSON() as { title: string; content: string; pinned: boolean }
      if (!note) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"笔记不存在"}' })
        return
      }
      Object.assign(note, body, { updatedAt: timestamp })
      writes.push({ id: note.id, ...body })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...summary(note), content: note.content }),
      })
      return
    }

    if (match && method === 'DELETE') {
      const index = notes.findIndex((item) => item.id === match[1])
      if (index >= 0) notes.splice(index, 1)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"未模拟"}' })
  })

  return { notes, writes }
}

async function openNotebook(page: Page) {
  const mock = await mockNotebook(page)
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="notebook"]').click()
  await expect(page.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible()
  await expect(page.getByText('系统凭据', { exact: true }).first()).toBeVisible()
  return mock
}

async function expectNoOverflow(page: Page) {
  const layout = await page.locator('#page-notebook').evaluate((activePage) => {
    const workspace = activePage.querySelector('.notebook-workspace')
    const editor = activePage.querySelector('.notebook-rich-editor__content')
    const richEditor = activePage.querySelector('.notebook-rich-editor')
    const footer = activePage.querySelector('.notebook-editor-panel__footer')
    const editorRect = editor?.getBoundingClientRect()
    const richEditorRect = richEditor?.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect()
    return {
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pageX: activePage.scrollWidth > activePage.clientWidth,
      pageY: activePage.scrollHeight > activePage.clientHeight + 1,
      workspaceX: workspace ? workspace.scrollWidth > workspace.clientWidth + 1 : true,
      editorWidth: editorRect?.width ?? 0,
      editorHeight: editorRect?.height ?? 0,
      editorInside: Boolean(editorRect && editorRect.bottom <= window.innerHeight + 1),
      editorFooterGap: richEditorRect && footerRect ? footerRect.top - richEditorRect.bottom : null,
    }
  })
  expect(layout).toMatchObject({
    documentX: false,
    pageX: false,
    pageY: false,
    workspaceX: false,
    editorInside: true,
  })
  expect(layout.editorWidth).toBeGreaterThan(300)
  expect(layout.editorHeight).toBeGreaterThan(100)
  expect(layout.editorFooterGap).toBeGreaterThanOrEqual(10)
  expect(layout.editorFooterGap).toBeLessThanOrEqual(16)
}

test('renders the Vue notebook workspace in both themes without the retired DOM', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openNotebook(page)

  await expect(page.locator('#vue-notebook-host .notebook-view')).toHaveCount(1)
  await expect(page.locator('#nbSearch')).toHaveCount(0)
  await expect(page.locator('#nbEditorContent')).toHaveCount(0)
  await expect(page.locator('script[src="js/notebook.js"]')).toHaveCount(0)
  await expect(page.locator('link[href="css/pages/notebook.css"]')).toHaveCount(0)
  const retiredGlobals = await page.evaluate(() => ({
    initNotebook: typeof (window as typeof window & { initNotebook?: unknown }).initNotebook,
    searchNotebook: typeof (window as typeof window & { nbSearchNotes?: unknown }).nbSearchNotes,
  }))
  expect(retiredGlobals).toEqual({
    initNotebook: 'undefined',
    searchNotebook: 'undefined',
  })
  await expectNoOverflow(page)

  await page.locator('#themeModeToggle').click()
  await page.locator('#themeModeMenu [data-theme-mode="dark"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectNoOverflow(page)
})

test('keeps the list and editor usable at 900 by 600', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await openNotebook(page)
  await expect(page.locator('.notebook-note-item')).toHaveCount(2)
  await expectNoOverflow(page)

  await page.getByRole('button', { name: '收起列表', exact: true }).click()
  await expect(page.locator('.notebook-list-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '展开列表', exact: true })).toBeVisible()
  await expectNoOverflow(page)
})

test('auto-saves edits and flushes before switching notes and searching', async ({ page }) => {
  const mock = await openNotebook(page)
  const title = page.getByRole('textbox', { name: '笔记标题' })
  const content = page.locator('.notebook-rich-editor__content')

  await title.fill('更新后的系统凭据')
  await content.fill('第一版正文')
  await expect.poll(() => mock.writes.length).toBe(1)
  expect(mock.writes[0]).toMatchObject({
    id: 'note-one',
    title: '更新后的系统凭据',
    content: '<p>第一版正文</p>',
  })

  await content.fill('切换之前必须保存')
  await page.getByText('日常备忘', { exact: true }).click()
  await expect.poll(() => mock.writes.length).toBe(2)
  expect(mock.writes[1]).toMatchObject({
    id: 'note-one',
    content: '<p>切换之前必须保存</p>',
  })

  await page.getByPlaceholder('搜索标题或正文…').fill('系统')
  await expect(page.getByText('更新后的系统凭据', { exact: true }).first()).toBeVisible()
})

test('cleans pasted HTML and supports editable credential tables with copy feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    })
  })
  const mock = await openNotebook(page)
  const content = page.locator('.notebook-rich-editor__content')

  await content.click()
  await content.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData('text/html', '<p class="source" style="color:red"><script>bad()</script><strong>统一格式</strong></p>')
    transfer.setData('text/plain', '统一格式')
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }))
  })
  await expect(content.getByText('统一格式', { exact: true })).toBeVisible()
  await expect(content.locator('.source')).toHaveCount(0)
  await expect(content.locator('script')).toHaveCount(0)

  await page.getByRole('button', { name: '更多笔记操作' }).click()
  await page.getByText('插入凭据信息表', { exact: true }).click()
  const table = content.locator('table[data-notebook-block="credential"]').last()
  await expect(table).toHaveAttribute('data-editing', 'true')
  const toolbar = page.getByRole('toolbar', { name: '凭据信息表 1 操作' })
  await expect(toolbar).toBeVisible()
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  // 工具栏必须留在非可编辑外层容器里，绝不能挂进标题单元格：
  // contenteditable="false" 的子节点会让整个 th 在 WebKit 下无法编辑，
  // 表现为凭据卡片标题不能修改文字（字段名与值单元格无此子节点，故不受影响）。
  expect(await toolbar.evaluate((element) => ({
    insideProjectHeader: element.parentElement?.matches('th[data-credential-project]') ?? false,
    insideEditableContent: Boolean(element.closest('[contenteditable="true"]')),
    inShell: element.parentElement?.matches('.notebook-rich-editor') ?? false,
    positionedInline: Boolean((element as HTMLElement).style.top),
  }))).toEqual({
    insideProjectHeader: false,
    insideEditableContent: false,
    inShell: true,
    positionedInline: true,
  })
  // 标题单元格内不得残留任何元素节点，否则又会退回不可编辑
  expect(await table.locator('th[data-credential-project]').evaluate(
    (cell) => cell.querySelectorAll('*').length,
  )).toBe(0)
  // 实质断言：标题必须真的能写入文字
  const projectTitle = table.locator('th[data-credential-project]')
  await projectTitle.click()
  await page.keyboard.type('示例项目')
  await expect(projectTitle).toHaveText('示例项目')
  await page.getByRole('button', { name: '新增字段', exact: true }).click()
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(table.locator('th[data-credential-field]')).toHaveCount(3)
  await expect(table.locator('tbody tr')).toHaveCount(2)

  const newField = table.locator('th[data-credential-field]').last()
  await expect(newField).toBeEmpty()
  await expect(newField).toHaveAttribute('data-placeholder', '字段 3')
  await newField.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      data: '',
    }))
    element.textContent = '中文字段'
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: '中文字段',
      inputType: 'insertCompositionText',
      isComposing: true,
    }))
    element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '中文字段',
    }))
  })
  await expect(newField).toHaveText('中文字段')

  const value = table.locator('td[data-credential-value]').first()
  await expect(value).toBeEmpty()
  await expect(value).toHaveAttribute('data-placeholder', '点击填写账号')
  await value.fill('demo-account')
  await value.evaluate((element) => {
    element.innerHTML = 'demo-account<div><br></div>'
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
    }))
  })
  await expect(value).toHaveJSProperty('innerHTML', 'demo-account')
  const blankLine = content.locator('p').last()
  await blankLine.click()
  await expect(table).toHaveAttribute('data-editing', 'true')
  await expect(page.getByRole('toolbar', { name: '凭据信息表 1 操作' })).toBeVisible()
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible()
  await page.keyboard.press('Meta+s')
  await expect(table).toHaveAttribute('data-editing', 'false')
  await expect(page.getByText('笔记已保存', { exact: true })).toBeVisible()
  await expect.poll(() => mock.writes.length).toBeGreaterThan(0)
  expect(mock.writes.at(-1)?.content).not.toContain('data-credential-runtime-controls')
  expect(mock.writes.at(-1)?.content).not.toContain('＋ 记录')

  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible()
  await expect(table).toHaveAttribute('data-editing', 'true')
  await page.getByRole('textbox', { name: '笔记标题' }).click()
  await expect(table).toHaveAttribute('data-editing', 'true')
  await page.keyboard.press('Meta+s')
  await expect(table).toHaveAttribute('data-editing', 'false')

  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(table).toHaveAttribute('data-editing', 'true')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(table).toHaveAttribute('data-editing', 'false')

  await value.click()
  await expect(value).toHaveAttribute('data-copy-state', 'done')
  await expect(page.getByText('已复制此项', { exact: true })).toBeVisible()
})

test('matches the credential card structure in light and dark themes', async ({ page }) => {
  await openNotebook(page)
  const content = page.locator('.notebook-rich-editor__content')
  await content.click()
  await page.getByRole('button', { name: '更多笔记操作' }).click()
  await page.getByText('插入凭据信息表', { exact: true }).click()

  const table = content.locator('table[data-notebook-block="credential"]')
  await expect(table).toHaveCount(1)
  await expect(table).toHaveAttribute('data-editing', 'true')
  const editingDecoration = await table.evaluate((element) => {
    const project = element.querySelector('[data-credential-project]')
    return {
      tableShadow: getComputedStyle(element).boxShadow,
      projectShadow: project ? getComputedStyle(project).boxShadow : '',
    }
  })
  expect(editingDecoration.tableShadow).toBe('none')
  expect(editingDecoration.projectShadow).toBe('none')
  await page.keyboard.press('Meta+s')
  await expect(table).toHaveAttribute('data-editing', 'false')

  const readStyles = () => table.evaluate((element) => {
    const tableStyle = getComputedStyle(element)
    const project = element.querySelector('[data-credential-project]')
    const field = element.querySelector('[data-credential-field]')
    const value = element.querySelector('[data-credential-value]')
    return {
      borderCollapse: tableStyle.borderCollapse,
      borderRadius: tableStyle.borderRadius,
      borderColor: tableStyle.borderTopColor,
      projectBackground: project ? getComputedStyle(project).backgroundColor : '',
      projectBackgroundImage: project ? getComputedStyle(project).backgroundImage : '',
      projectColor: project ? getComputedStyle(project).color : '',
      projectWeight: project ? getComputedStyle(project).fontWeight : '',
      fieldColor: field ? getComputedStyle(field).color : '',
      valueFont: value ? getComputedStyle(value).fontFamily : '',
    }
  })

  const light = await readStyles()
  expect(light.borderCollapse).toBe('separate')
  expect(light.borderRadius).toBe('9px')
  expect(light.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(light.projectBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(light.projectBackgroundImage).toContain('linear-gradient')
  expect(light.projectColor).not.toBe(light.fieldColor)
  expect(light.projectWeight).toBe('650')
  expect(light.valueFont).toContain('SF Mono')

  await page.locator('#themeModeToggle').click()
  await page.locator('#themeModeMenu [data-theme-mode="dark"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  const dark = await readStyles()
  expect(dark.borderCollapse).toBe('separate')
  expect(dark.borderRadius).toBe('9px')
  expect(dark.borderColor).not.toBe(light.borderColor)
  expect(dark.projectBackground).not.toBe(light.projectBackground)
  expect(dark.projectBackgroundImage).toContain('linear-gradient')
  expect(dark.projectColor).not.toBe(dark.fieldColor)
  expect(dark.projectWeight).toBe('650')
})

test('creates links only from an explicit text selection', async ({ page }) => {
  await openNotebook(page)
  const content = page.locator('.notebook-rich-editor__content')
  const selectedUrl = 'https://example.com/docs'

  await content.click()
  await content.evaluate((element, url) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', url)
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }))
  }, selectedUrl)
  await expect(content.locator('a')).toHaveCount(0)

  await content.evaluate((element, url) => {
    const paragraph = Array.from(element.querySelectorAll('p')).find((item) => item.textContent === url)
    const text = paragraph?.firstChild
    if (!text) throw new Error('Missing URL text')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    ;(element as HTMLElement).focus()
  }, selectedUrl)
  await page.getByRole('button', { name: '更多笔记操作' }).click()
  await page.getByText('将选中文字设为链接', { exact: true }).click()
  await expect(content.locator('a')).toHaveAttribute('href', selectedUrl)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await content.evaluate((element) => {
    const paragraph = document.createElement('p')
    paragraph.textContent = '项目文档'
    element.append(paragraph)
    element.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const text = paragraph.firstChild
    if (!text) throw new Error('Missing custom link text')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    ;(element as HTMLElement).focus()
  })
  await page.getByRole('button', { name: '更多笔记操作' }).click()
  await page.getByText('将选中文字设为链接', { exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByPlaceholder('https://example.com').fill('https://example.com/project')
  await page.getByRole('button', { name: '设为链接', exact: true }).click()
  await expect(content.getByRole('link', { name: '项目文档' })).toHaveAttribute('href', 'https://example.com/project')
})

test('inserts a credential table at the saved editor caret instead of the document end', async ({ page }) => {
  await openNotebook(page)
  const content = page.locator('.notebook-rich-editor__content')

  await content.evaluate((element) => {
    const editor = element as HTMLElement
    editor.innerHTML = [
      '<p data-test-block="above">插入位置上方</p>',
      '<p data-test-block="below">插入位置下方</p>',
      '<table data-notebook-block="credential">',
      '<thead>',
      '<tr><th data-credential-project colspan="2">已有凭据表</th></tr>',
      '<tr><th data-credential-field>字段一</th><th data-credential-field>字段二</th></tr>',
      '</thead>',
      '<tbody><tr><td data-credential-value>公开示例一</td><td data-credential-value>公开示例二</td></tr></tbody>',
      '</table>',
    ].join('')
    editor.focus()

    const belowText = editor.querySelector('[data-test-block="below"]')?.firstChild
    if (!belowText) throw new Error('Missing insertion anchor')
    const range = document.createRange()
    range.setStart(belowText, 4)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })

  expect(await content.evaluate((element) => {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    return {
      editorFocused: document.activeElement === element,
      block: range?.startContainer.parentElement?.getAttribute('data-test-block'),
      offset: range?.startOffset,
    }
  })).toEqual({ editorFocused: true, block: 'below', offset: 4 })

  const moreButton = page.getByRole('button', { name: '更多笔记操作' })
  await moreButton.click()
  await page.getByText('插入凭据信息表', { exact: true }).click()

  const tables = content.locator('table[data-notebook-block="credential"]')
  await expect(tables).toHaveCount(2)
  await expect(tables.nth(0)).toHaveAttribute('data-editing', 'true')
  await expect(tables.nth(1)).not.toHaveAttribute('data-editing', 'true')
  await expect.poll(() => content.evaluate((element) => {
    return Array.from(element.children).map((child) => {
      if (child.matches('[data-test-block="above"]')) return 'above'
      if (child.matches('table[data-editing="true"]')) return 'inserted'
      if (child.textContent === '插入位置') return 'below-before'
      if (child.textContent === '下方') return 'below-after'
      if (child.matches('table[data-notebook-block="credential"]')) return 'existing'
      return 'other'
    }).filter((item) => item !== 'other')
  })).toEqual(['above', 'below-before', 'inserted', 'below-after', 'existing'])
})
