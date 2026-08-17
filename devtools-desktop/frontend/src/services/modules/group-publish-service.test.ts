import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient, ApiError } from '@/services/api-client'
import {
  assertGatewayProfileReady,
  connectGroupGateway,
  emptyGroupPublishProfile,
  getGroupPublishProfiles,
  isGatewayPublish,
  normalizeGroupPublishProfile,
  saveGroupPublishProfile,
} from './group-publish-service'

describe('group publish service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes profiles and treats unknown mode as direct SFTP', () => {
    const profile = normalizeGroupPublishProfile({
      groupName: '业务组',
      publishMode: 'mystery',
      gatewayUrl: ' https://gw.example ',
      devices: [{ projectName: 'portal', remotePath: ' /www/portal/ ' }, { projectName: '' }],
    })
    expect(profile).toMatchObject({
      groupName: '业务组',
      publishMode: 'direct-sftp',
      gatewayUrl: 'https://gw.example',
      devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    })
    expect(isGatewayPublish(profile)).toBe(false)
    expect(emptyGroupPublishProfile('x').publishMode).toBe('direct-sftp')
  })

  it('requires password mask and remote path before handing off', () => {
    const profile = normalizeGroupPublishProfile({
      publishMode: 'gateway-filezilla',
      gatewayUrl: 'https://gw.example/login',
      gatewayUsername: 'ops',
      passwordMasked: '******',
      devices: [{ projectName: 'portal', remotePath: '/www/portal/' }],
    })
    expect(assertGatewayProfileReady(profile, 'portal')).toBe('')
    expect(assertGatewayProfileReady({ ...profile, passwordMasked: '' }, 'portal')).toBe('请先保存网关密码')
    expect(assertGatewayProfileReady({ ...profile, devices: [] }, 'portal')).toBe('请先为项目「portal」填写远程路径')
  })

  it('lists profiles through the API client', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValueOnce({
      业务组: { groupName: '业务组', publishMode: 'gateway-filezilla' },
    } as never)

    const map = await getGroupPublishProfiles()
    expect(map['业务组']?.publishMode).toBe('gateway-filezilla')
    expect(request).toHaveBeenCalledWith('/api/group-publish', {
      timeout: 15_000,
      signal: undefined,
    })
  })

  it('encodes group names when saving', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      groupName: '茅台项目',
      publishMode: 'gateway-filezilla',
    } as never)

    await saveGroupPublishProfile('茅台项目', {
      publishMode: 'gateway-filezilla',
      gatewayUrl: 'https://gw.example/login',
      gatewayUsername: 'ops',
      devices: [],
    })
    expect(put).toHaveBeenCalledWith(
      '/api/group-publish/%E8%8C%85%E5%8F%B0%E9%A1%B9%E7%9B%AE',
      expect.objectContaining({ publishMode: 'gateway-filezilla' }),
      15_000,
    )
  })

  it('uses a long timeout for gateway connect', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      distPath: '/apps/portal/dist',
      message: 'done',
    } as never)

    await expect(connectGroupGateway('业务组', 'portal')).resolves.toMatchObject({
      ok: true,
      distPath: '/apps/portal/dist',
    })
    expect(post).toHaveBeenCalledWith(
      '/api/group-publish/%E4%B8%9A%E5%8A%A1%E7%BB%84/connect',
      { projectName: 'portal' },
      40_000,
    )
  })

  it('preserves distPath from HTTP error details', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new ApiError('请先保存网关密码', 'http', {
      status: 400,
      details: { error: '请先保存网关密码', distPath: '/apps/portal/dist' },
    }))

    await expect(connectGroupGateway('g', 'portal')).rejects.toMatchObject({
      message: '请先保存网关密码',
      details: { distPath: '/apps/portal/dist' },
    })
  })
});
