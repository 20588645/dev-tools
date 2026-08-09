import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeProject, type Project } from '@/services/modules/project-service'

import { useProjectConfig } from './useProjectConfig'

vi.mock('@/services/modules/project-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/modules/project-service')>(
    '@/services/modules/project-service',
  )
  return { ...actual, updateProject: vi.fn() }
})

const service = await import('@/services/modules/project-service')
const updateProject = vi.mocked(service.updateProject)

const project = (overrides: Record<string, unknown> = {}): Project => normalizeProject({
  name: 'b8seed-portal',
  displayName: 'b8seed 门户',
  type: 'multi-module',
  nodeVersion: '18.19.1',
  defaultServerIds: ['srv-1', 'srv-2'],
  defaultServerId: 'srv-1',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  updateProject.mockResolvedValue(undefined)
})

describe('useProjectConfig', () => {
  it('打开时回填别名、Node 版本与默认服务器', () => {
    const config = useProjectConfig()
    config.openFor(project())

    expect(config.open.value).toBe(true)
    expect(config.state.value).toEqual({
      displayName: 'b8seed 门户',
      nodeVersion: '18.19.1',
      serverIds: ['srv-1', 'srv-2'],
    })
  })

  /*
    后端存空串表示「回落到文件夹名」，而 normalizeProject 会把空的 displayName
    填成 name。回填时若不还原成空串，用户一保存就把文件夹名写死成别名了。
  */
  it('别名等于项目名时回填为空，保留「留空则显示文件夹名」语义', () => {
    const config = useProjectConfig()
    config.openFor(project({ displayName: '' }))

    expect(config.state.value.displayName).toBe('')
  })

  /* 数组为空时回落单值字段，与 projectDefaultServerIds 的归一一致。 */
  it('只有单值 defaultServerId 时也能回填', () => {
    const config = useProjectConfig()
    config.openFor(project({ defaultServerIds: [], defaultServerId: 'srv-9' }))

    expect(config.state.value.serverIds).toEqual(['srv-9'])
  })

  it('无默认服务器时为空数组', () => {
    const config = useProjectConfig()
    config.openFor(project({ defaultServerIds: [], defaultServerId: '' }))

    expect(config.state.value.serverIds).toEqual([])
  })

  it('切换服务器勾选是幂等的加减', () => {
    const config = useProjectConfig()
    config.openFor(project({ defaultServerIds: [], defaultServerId: '' }))

    config.toggleServer('srv-1')
    config.toggleServer('srv-2')
    expect(config.state.value.serverIds).toEqual(['srv-1', 'srv-2'])

    config.toggleServer('srv-1')
    expect(config.state.value.serverIds).toEqual(['srv-2'])
  })

  /*
    这条锁后端兼容契约：单值 defaultServerId 必须与数组一起写，只写数组会让
    仍读单值字段的旧路径拿到空值。
  */
  it('提交时单值与数组字段一起写，单值取第一个', async () => {
    const config = useProjectConfig()
    config.openFor(project())
    config.patch({ displayName: '  门户  ', nodeVersion: '20.19.2' })

    const name = await config.submit()

    expect(name).toBe('b8seed-portal')
    expect(updateProject).toHaveBeenCalledWith('b8seed-portal', {
      displayName: '门户',
      nodeVersion: '20.19.2',
      defaultServerId: 'srv-1',
      defaultServerIds: ['srv-1', 'srv-2'],
    })
    // 成功后弹窗关闭
    expect(config.open.value).toBe(false)
  })

  it('不选任何服务器时单值写空串', async () => {
    const config = useProjectConfig()
    config.openFor(project({ defaultServerIds: [], defaultServerId: '' }))

    await config.submit()

    expect(updateProject).toHaveBeenCalledWith('b8seed-portal', expect.objectContaining({
      defaultServerId: '',
      defaultServerIds: [],
    }))
  })

  it('保存失败时保留弹窗与已填内容，并给出原因', async () => {
    updateProject.mockRejectedValue(new Error('数据库已锁'))
    const config = useProjectConfig()
    config.openFor(project())
    config.patch({ displayName: '改了一半' })

    const name = await config.submit()

    expect(name).toBeNull()
    expect(config.error.value).toBe('数据库已锁')
    // 失败不能吞掉用户输入
    expect(config.open.value).toBe(true)
    expect(config.state.value.displayName).toBe('改了一半')
    expect(config.saving.value).toBe(false)
  })

  it('未打开时提交是空操作', async () => {
    const config = useProjectConfig()

    expect(await config.submit()).toBeNull()
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('关闭会清掉上一次的错误，下次打开不残留', () => {
    const config = useProjectConfig()
    config.openFor(project())
    config.error.value = '上次失败了'

    config.close()

    expect(config.open.value).toBe(false)
    expect(config.error.value).toBe('')
  })

  /*
    legacy 的 configCheckedServers 是模块级 Set，关掉弹窗不清空，换项目再开会
    带上一次的勾选。这条锁住私有化后的行为。
  */
  it('换项目重开不残留上次勾选', () => {
    const config = useProjectConfig()
    config.openFor(project())
    config.toggleServer('srv-3')
    config.close()

    config.openFor(project({ name: 'b8seed-blog', defaultServerIds: [], defaultServerId: '' }))

    expect(config.state.value.serverIds).toEqual([])
  })
})
