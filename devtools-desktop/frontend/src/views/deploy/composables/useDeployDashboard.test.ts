import { describe, expect, it } from 'vitest'

import { normalizeProject } from '@/services/modules/project-service'

import { useDeployDashboard } from './useDeployDashboard'

const project = (overrides: Record<string, unknown> = {}) => normalizeProject({
  name: 'portal',
  displayName: '门户',
  type: 'single',
  groupName: '业务组',
  ...overrides,
})

describe('useDeployDashboard 配置筛选', () => {
  it('允许网关组按设备 IP 而不是服务器来算已配置', () => {
    const page = useDeployDashboard({
      isProjectConfigured: item => item.name === 'ready',
    })
    page.projects.value = [
      project({ name: 'ready', displayName: '已配' }),
      project({ name: 'wait', displayName: '未配' }),
    ]

    expect(page.stats.value.configured).toBe(1)
    page.filter.value = 'configured'
    expect(page.filtered.value.map(item => item.name)).toEqual(['ready'])
    page.filter.value = 'unconfigured'
    expect(page.filtered.value.map(item => item.name)).toEqual(['wait'])
    page.filter.value = 'all'
    expect(page.groupViews.value[0]?.configuredCount).toBe(1)
  })
})
