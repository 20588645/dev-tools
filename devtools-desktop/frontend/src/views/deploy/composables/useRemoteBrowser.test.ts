import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RemoteBrowseResult } from '@/services/modules/deploy-service'

import { useRemoteBrowser, type RemoteBrowserTarget } from './useRemoteBrowser'

vi.mock('@/services/modules/deploy-service', () => ({
  browseRemoteDir: vi.fn(),
}))

const service = await import('@/services/modules/deploy-service')
const browseRemoteDir = vi.mocked(service.browseRemoteDir)

const TARGET: RemoteBrowserTarget = {
  serverId: 'srv-1',
  serverName: '同仁堂生产',
  host: '192.168.1.15',
  startPath: '/docker/nginx/www',
}

const result = (overrides: Partial<RemoteBrowseResult> = {}): RemoteBrowseResult => ({
  path: '/docker/nginx/www',
  fallback: '',
  items: [
    { name: 'html', isDir: true, size: 0, mtime: 1_786_096_800_000 },
    { name: 'index.html', isDir: false, size: 2048, mtime: 1_786_096_800_000 },
    { name: '.hidden', isDir: false, size: 10, mtime: 1_786_096_800_000 },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  browseRemoteDir.mockResolvedValue(result())
})

describe('useRemoteBrowser 打开与导航', () => {
  it('打开时从服务器默认发布目录开始', async () => {
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.open.value).toBe(true)
    expect(browseRemoteDir).toHaveBeenCalledWith('srv-1', '/docker/nginx/www')
    expect(browser.currentDir.value).toBe('/docker/nginx/www')
  })

  it('默认发布目录为空时从根开始', async () => {
    browseRemoteDir.mockResolvedValue(result({ path: '/' }))
    const browser = useRemoteBrowser()
    await browser.show({ ...TARGET, startPath: '' })

    expect(browseRemoteDir).toHaveBeenCalledWith('srv-1', '/')
  })

  /* 后端目标不可达时会逐级回退，返回的 path 才是真实所在目录。 */
  it('以返回的 path 为准，而非请求路径', async () => {
    browseRemoteDir.mockResolvedValue(result({
      path: '/docker',
      fallback: '路径 /docker/nginx/www 不存在，已自动跳转到 /docker',
    }))
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.currentDir.value).toBe('/docker')
    expect(browser.fallback.value).toContain('已自动跳转到 /docker')
  })

  it('隐藏文件不进列表', async () => {
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.entries.value).toHaveLength(3)
    expect(browser.visibleEntries.value.map(item => item.name)).toEqual(['html', 'index.html'])
  })

  it('面包屑按路径层级展开，首段是根', async () => {
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.breadcrumbs.value).toEqual([
      { label: '/', path: '/' },
      { label: 'docker', path: '/docker' },
      { label: 'nginx', path: '/docker/nginx' },
      { label: 'www', path: '/docker/nginx/www' },
    ])
  })

  it('根目录时面包屑只有一段且无上级', async () => {
    browseRemoteDir.mockResolvedValue(result({ path: '/' }))
    const browser = useRemoteBrowser()
    await browser.show({ ...TARGET, startPath: '/' })

    expect(browser.breadcrumbs.value).toEqual([{ label: '/', path: '/' }])
    expect(browser.parentDir.value).toBeNull()
  })

  it('非根目录给出上级路径', async () => {
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.parentDir.value).toBe('/docker/nginx')
  })

  it('上级为一级目录时回落到根', async () => {
    browseRemoteDir.mockResolvedValue(result({ path: '/docker' }))
    const browser = useRemoteBrowser()
    await browser.show({ ...TARGET, startPath: '/docker' })

    expect(browser.parentDir.value).toBe('/')
  })

  it('未打开时导航是空操作', async () => {
    const browser = useRemoteBrowser()
    await browser.navigate('/etc')

    expect(browseRemoteDir).not.toHaveBeenCalled()
  })
})

describe('useRemoteBrowser 失败态', () => {
  it('读取失败时清空列表并给出原因', async () => {
    browseRemoteDir.mockRejectedValue(new Error('连接超时 (10s)'))
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.entries.value).toEqual([])
    expect(browser.error.value).toBe('连接超时 (10s)')
    expect(browser.loading.value).toBe(false)
    // 弹窗保持打开，用户可点「返回根目录」重试
    expect(browser.open.value).toBe(true)
  })

  it('重试成功后清掉上次的错误', async () => {
    browseRemoteDir.mockRejectedValueOnce(new Error('连接超时 (10s)'))
    const browser = useRemoteBrowser()
    await browser.show(TARGET)
    expect(browser.error.value).not.toBe('')

    browseRemoteDir.mockResolvedValue(result({ path: '/' }))
    await browser.navigate('/')

    expect(browser.error.value).toBe('')
    expect(browser.currentDir.value).toBe('/')
  })

  it('换目录成功后清掉上次的回落提示', async () => {
    browseRemoteDir.mockResolvedValueOnce(result({ path: '/docker', fallback: '已自动跳转' }))
    const browser = useRemoteBrowser()
    await browser.show(TARGET)
    expect(browser.fallback.value).toBe('已自动跳转')

    browseRemoteDir.mockResolvedValue(result({ path: '/docker/nginx' }))
    await browser.navigate('/docker/nginx')

    expect(browser.fallback.value).toBe('')
  })

  it('重开弹窗不残留上次的错误与列表', async () => {
    browseRemoteDir.mockRejectedValueOnce(new Error('连接失败'))
    const browser = useRemoteBrowser()
    await browser.show(TARGET)
    browser.close()

    expect(browser.open.value).toBe(false)
    expect(browser.error.value).toBe('')

    browseRemoteDir.mockResolvedValue(result())
    await browser.show(TARGET)
    expect(browser.error.value).toBe('')
    expect(browser.visibleEntries.value).toHaveLength(2)
  })
})

describe('useRemoteBrowser 确认路径', () => {
  /*
    后端按目录拼接上传路径，缺尾斜杠会把最后一段当文件名前缀，故统一补上。
  */
  it('确认时补尾斜杠并关闭弹窗', async () => {
    const browser = useRemoteBrowser()
    await browser.show(TARGET)

    expect(browser.confirm()).toBe('/docker/nginx/www/')
    expect(browser.open.value).toBe(false)
  })

  it('已有尾斜杠不重复补', async () => {
    browseRemoteDir.mockResolvedValue(result({ path: '/docker/' }))
    const browser = useRemoteBrowser()
    await browser.show({ ...TARGET, startPath: '/docker/' })

    expect(browser.confirm()).toBe('/docker/')
  })

  it('根目录确认为单斜杠', async () => {
    browseRemoteDir.mockResolvedValue(result({ path: '/' }))
    const browser = useRemoteBrowser()
    await browser.show({ ...TARGET, startPath: '/' })

    expect(browser.confirm()).toBe('/')
  })
})
