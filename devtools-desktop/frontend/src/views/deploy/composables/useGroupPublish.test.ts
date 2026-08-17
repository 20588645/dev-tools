import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/api-client'
import type { GroupPublishProfile } from '@/services/modules/group-publish-service'
import { normalizeProject } from '@/services/modules/project-service'

import { useGroupPublish } from './useGroupPublish'

function profile(overrides: Partial<GroupPublishProfile> = {}): GroupPublishProfile {
  return {
    groupName: '业务组',
    publishMode: 'gateway-filezilla',
    gatewayUrl: 'https://gw.example/login',
    gatewayUsername: 'ops',
    passwordMasked: '******',
    devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    ...overrides,
  }
}

const project = () => normalizeProject({
  name: 'portal',
  displayName: '门户',
  type: 'single',
  path: '/apps/portal',
  groupName: '业务组',
})

describe('useGroupPublish', () => {
  const service = {
    getGroupPublishProfiles: vi.fn(),
    getGroupPublishProfile: vi.fn(),
    saveGroupPublishProfile: vi.fn(),
    renameGroupPublishProfile: vi.fn(),
    connectGroupGateway: vi.fn(),
    distPathFromConnectError: vi.fn(),
    remotePathFromConnectError: vi.fn(),
  }
  const clipboard = { writeText: vi.fn() }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    service.getGroupPublishProfiles.mockResolvedValue({ 业务组: profile() })
    service.getGroupPublishProfile.mockResolvedValue(profile())
    service.saveGroupPublishProfile.mockResolvedValue(profile())
    service.connectGroupGateway.mockResolvedValue({
      ok: true,
      distPath: '/apps/portal/dist',
      remotePath: '/www/portal/',
      message: '网关已打开。请在 Chrome 里点 SFTP 调起 FileZilla，并把产物拖到远程路径。',
    })
    service.distPathFromConnectError.mockReturnValue('')
    service.remotePathFromConnectError.mockReturnValue('')
    clipboard.writeText.mockResolvedValue(undefined)
  })

  it('opens a draft with one device row per project and keeps the password blank', async () => {
    const page = useGroupPublish({ service: service as never })
    await page.openConfig('业务组', [project()])
    expect(page.draft.value?.devices).toEqual([
      { projectName: 'portal', displayName: '门户', remotePath: '/www/portal/' },
    ])
    expect(page.draft.value?.gatewayPassword).toBe('')
    expect(page.draft.value?.passwordMasked).toBe('******')
  })

  it('saves without sending a password when the field is left blank', async () => {
    const page = useGroupPublish({ service: service as never })
    await page.openConfig('业务组', [project()])
    page.setRemotePath('portal', '/www/new/')
    await expect(page.saveConfig()).resolves.toBe(true)
    expect(service.saveGroupPublishProfile).toHaveBeenCalledWith('业务组', expect.objectContaining({
      gatewayPassword: '',
      devices: [{ projectName: 'portal', remotePath: '/www/new/' }],
    }))
    expect(page.draft.value).toBeNull()
  })

  it('rejects gateway save when password has never been stored', async () => {
    service.getGroupPublishProfile.mockResolvedValueOnce(profile({ passwordMasked: '' }))
    const page = useGroupPublish({ service: service as never })
    await page.openConfig('业务组', [project()])
    await expect(page.saveConfig()).resolves.toBe(false)
    expect(page.configError.value).toBe('请填写网关密码')
    expect(service.saveGroupPublishProfile).not.toHaveBeenCalled()
  })

  it('starts handoff after a matching successful build-only finish', async () => {
    const page = useGroupPublish({ service: service as never })
    page.armAfterBuild('业务组', 'portal')
    await page.handleBuildFinished({ projectName: 'portal', success: true, type: 'build-only' }, project())
    expect(page.handoff.value).toMatchObject({
      distPath: '/apps/portal/dist',
      remotePath: '/www/portal/',
      status: 'success',
      message: '网关已打开。请在 Chrome 里点 SFTP 调起 FileZilla，并把产物拖到远程路径。',
    })
    expect(service.connectGroupGateway).toHaveBeenCalledWith('业务组', 'portal')
  })

  it('ignores failed or deploy finishes even if a handoff is armed', async () => {
    const page = useGroupPublish({ service: service as never })
    page.armAfterBuild('业务组', 'portal')
    await page.handleBuildFinished({ projectName: 'portal', success: false, type: 'build-only' }, project())
    await page.handleBuildFinished({ projectName: 'portal', success: true, type: 'deploy' }, project())
    expect(service.connectGroupGateway).not.toHaveBeenCalled()
    expect(page.handoff.value).toBeNull()
  })

  it('keeps distPath when connect fails and can copy it', async () => {
    service.connectGroupGateway.mockRejectedValueOnce(new ApiError('请先保存网关密码', 'http', {
      details: { distPath: '/apps/portal/dist' },
    }))
    service.distPathFromConnectError.mockReturnValue('/apps/portal/dist')
    const page = useGroupPublish({ service: service as never, clipboard })
    await page.beginHandoff('业务组', project())
    expect(page.handoff.value).toMatchObject({
      status: 'error',
      distPath: '/apps/portal/dist',
      message: '请先保存网关密码',
    })
    await expect(page.copyHandoffPath('dist')).resolves.toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledWith('/apps/portal/dist')
    expect(page.copied.value).toBe('dist')
  })

  it('copies the configured remote path separately', async () => {
    const page = useGroupPublish({ service: service as never, clipboard })
    await page.beginHandoff('业务组', project())
    await expect(page.copyHandoffPath('remote')).resolves.toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledWith('/www/portal/')
    expect(page.copied.value).toBe('remote')
  })
})
