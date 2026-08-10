import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowseEntry } from '@/services/modules/deploy-service'

import { useAddProject } from './useAddProject'

vi.mock('@/services/modules/deploy-service', () => ({
  getAvailableProjects: vi.fn(),
  browseProjects: vi.fn(),
  addProjects: vi.fn(),
}))

const service = await import('@/services/modules/deploy-service')
const getAvailableProjects = vi.mocked(service.getAvailableProjects)
const browseProjects = vi.mocked(service.browseProjects)
const addProjects = vi.mocked(service.addProjects)

const ROOT = '/Users/ldy/project'

const entry = (overrides: Partial<BrowseEntry> = {}): BrowseEntry => ({
  name: 'portal',
  path: `${ROOT}/portal`,
  isProject: true,
  alreadyAdded: false,
  hasSubDirs: false,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getAvailableProjects.mockResolvedValue([
    { name: 'b8seed-portal', path: `${ROOT}/b8seed-portal` },
    { name: 'b8seed-blog', path: `${ROOT}/b8seed-blog` },
    { name: 'shop', path: `${ROOT}/shop` },
  ])
  browseProjects.mockResolvedValue({
    currentDir: ROOT,
    root: ROOT,
    entries: [entry()],
  })
  addProjects.mockResolvedValue({ added: 1, skipped: [], failed: [] })
})

describe('useAddProject 自动扫描', () => {
  it('打开时取候选项目并复位到扫描模式', async () => {
    const add = useAddProject()
    await add.show()

    expect(add.open.value).toBe(true)
    expect(add.mode.value).toBe('scan')
    expect(add.visibleAvailable.value).toHaveLength(3)
    // 打开时不该顺手发浏览请求
    expect(browseProjects).not.toHaveBeenCalled()
  })

  it('搜索按名称过滤，不区分大小写', async () => {
    const add = useAddProject()
    await add.show()
    add.query.value = 'B8SEED'

    expect(add.visibleAvailable.value.map(item => item.name)).toEqual(['b8seed-portal', 'b8seed-blog'])
  })

  it('勾选是幂等的加减，按钮文案跟着计数走', async () => {
    const add = useAddProject()
    await add.show()

    expect(add.submitLabel.value).toBe('添加选中项目')
    add.toggleScan(`${ROOT}/shop`)
    expect(add.submitLabel.value).toBe('添加 1 个项目')
    add.toggleScan(`${ROOT}/b8seed-blog`)
    expect(add.submitLabel.value).toBe('添加 2 个项目')
    add.toggleScan(`${ROOT}/shop`)
    expect(add.selectedPaths.value).toEqual([`${ROOT}/b8seed-blog`])
  })

  /*
    legacy 的 toggleAllAvailable 对 availableProjects 全量加选，搜索状态下会把
    用户看不见的项目一起选上。这条锁住「全选 = 选中所见」。
  */
  it('全选只作用于当前搜索结果', async () => {
    const add = useAddProject()
    await add.show()
    add.query.value = 'b8seed'
    add.toggleAllScan(true)

    expect([...add.scanChecked.value].sort()).toEqual([
      `${ROOT}/b8seed-blog`,
      `${ROOT}/b8seed-portal`,
    ])
  })

  it('全不选清空全部勾选', async () => {
    const add = useAddProject()
    await add.show()
    add.toggleAllScan(true)
    add.toggleAllScan(false)

    expect(add.scanChecked.value.size).toBe(0)
  })

  /* 三种空态各有不同处置建议，共用一句会误导用户。 */
  it('三种空态可区分：无候选 / 搜索无匹配 / 全部已添加', async () => {
    const add = useAddProject()
    await add.show()
    expect(add.scanEmptyKind.value).toBe('all-added')

    add.query.value = '不存在的名字'
    expect(add.scanEmptyKind.value).toBe('no-match')

    getAvailableProjects.mockResolvedValue([])
    await add.show()
    expect(add.scanEmptyKind.value).toBe('none-found')
  })

  it('取候选失败时给出原因且不留旧数据', async () => {
    getAvailableProjects.mockRejectedValue(new Error('sidecar 未启动'))
    const add = useAddProject()
    await add.show()

    expect(add.available.value).toEqual([])
    expect(add.error.value).toContain('sidecar 未启动')
    expect(add.scanLoading.value).toBe(false)
  })
})

describe('useAddProject 手动浏览', () => {
  it('首次切到浏览模式才发请求，再切回来不重复取数', async () => {
    const add = useAddProject()
    await add.show()

    await add.switchMode('browse')
    expect(browseProjects).toHaveBeenCalledTimes(1)

    await add.switchMode('scan')
    await add.switchMode('browse')
    expect(browseProjects).toHaveBeenCalledTimes(1)
  })

  it('面包屑按相对根目录的层级展开', async () => {
    browseProjects.mockResolvedValue({
      currentDir: `${ROOT}/group-a/sub-b`,
      root: ROOT,
      entries: [],
    })
    const add = useAddProject()
    await add.show()
    await add.switchMode('browse')

    expect(add.breadcrumbs.value).toEqual([
      { label: 'project', path: ROOT },
      { label: 'group-a', path: `${ROOT}/group-a` },
      { label: 'sub-b', path: `${ROOT}/group-a/sub-b` },
    ])
  })

  it('停在根目录时面包屑只有一段', async () => {
    const add = useAddProject()
    await add.show()
    await add.switchMode('browse')

    expect(add.breadcrumbs.value).toEqual([{ label: 'project', path: ROOT }])
  })

  it('浏览失败时给出原因且清空列表', async () => {
    browseProjects.mockRejectedValue(new Error('不允许浏览此目录'))
    const add = useAddProject()
    await add.show()
    await add.switchMode('browse')

    expect(add.entries.value).toEqual([])
    expect(add.error.value).toContain('不允许浏览此目录')
    expect(add.browseLoading.value).toBe(false)
  })

  /* 两套勾选各自独立：切模式不清对方的选择，但提交只取当前模式那一份。 */
  it('提交只取当前模式的勾选', async () => {
    const add = useAddProject()
    await add.show()
    add.toggleScan(`${ROOT}/shop`)
    await add.switchMode('browse')
    add.toggleBrowse(`${ROOT}/portal`)

    expect(add.selectedPaths.value).toEqual([`${ROOT}/portal`])

    await add.switchMode('scan')
    expect(add.selectedPaths.value).toEqual([`${ROOT}/shop`])
  })

  it('重新打开会清掉两套勾选与浏览位置', async () => {
    const add = useAddProject()
    await add.show()
    add.toggleScan(`${ROOT}/shop`)
    await add.switchMode('browse')
    add.toggleBrowse(`${ROOT}/portal`)

    await add.show()

    expect(add.mode.value).toBe('scan')
    expect(add.scanChecked.value.size).toBe(0)
    expect(add.browseChecked.value.size).toBe(0)
    expect(add.breadcrumbs.value).toEqual([])
  })
})

describe('useAddProject 提交', () => {
  it('分列已存在跳过与真失败', async () => {
    addProjects.mockResolvedValue({
      added: 1,
      skipped: [{ path: `${ROOT}/b8seed-blog`, error: '已存在' }],
      failed: [{ path: `${ROOT}/broken`, error: '缺少 package.json' }],
    })
    const add = useAddProject()
    await add.show()
    add.toggleScan(`${ROOT}/shop`)

    const result = await add.submit()

    expect(result).toEqual({
      added: 1,
      skipped: [{ path: `${ROOT}/b8seed-blog`, error: '已存在' }],
      failed: [{ path: `${ROOT}/broken`, error: '缺少 package.json' }],
    })
    expect(add.open.value).toBe(false)
  })

  it('未勾选时不发请求', async () => {
    const add = useAddProject()
    await add.show()

    expect(await add.submit()).toBeNull()
    expect(addProjects).not.toHaveBeenCalled()
  })

  it('提交失败时保留弹窗与勾选，并给出原因', async () => {
    addProjects.mockRejectedValue(new Error('写入 projects.json 失败'))
    const add = useAddProject()
    await add.show()
    add.toggleScan(`${ROOT}/shop`)

    expect(await add.submit()).toBeNull()
    expect(add.open.value).toBe(true)
    expect(add.scanChecked.value.size).toBe(1)
    expect(add.error.value).toContain('写入 projects.json 失败')
    expect(add.submitting.value).toBe(false)
  })
})
