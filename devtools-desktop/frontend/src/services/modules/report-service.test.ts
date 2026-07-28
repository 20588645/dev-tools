import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/services/api-client'
import {
  generateGitActivity,
  getReportConfig,
  normalizeGenerateReportResult,
  normalizeReportConfig,
} from './report-service'

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('report service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes incomplete config and result payloads', () => {
    expect(normalizeReportConfig({
      token: 'token',
      author: 'Ledy',
      repos: [{ repo: 'https://gitlab.example/devtools.git' }],
    })).toEqual({
      token: 'token',
      author: 'Ledy',
      outputDir: '',
      repos: [{
        repo: 'https://gitlab.example/devtools.git',
        branch: '',
        group: '',
      }],
    })

    expect(normalizeGenerateReportResult({
      results: [{
        project: 'devtools',
        logs: [{ date: '2026-07-27', subject: 'feat: migrate notes', hash: 'a1b2c3d' }],
      }],
    })).toEqual({
      markdown: '',
      results: [{
        project: 'devtools',
        repo: '',
        branch: '',
        group: '',
        error: '',
        logs: [{
          date: '2026-07-27',
          author: '',
          subject: 'feat: migrate notes',
          hash: 'a1b2c3d',
        }],
      }],
    })
  })

  it('loads saved config and generates the requested week', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      token: 'token',
      author: 'Ledy',
      outputDir: '',
      repos: [{ repo: 'https://gitlab.example/devtools.git', branch: 'main', group: 'desktop' }],
    })
    vi.mocked(apiClient.post).mockResolvedValue({
      results: [{
        project: 'devtools',
        repo: 'https://gitlab.example/devtools.git',
        branch: 'main',
        group: 'desktop',
        logs: [],
        error: null,
      }],
      markdown: '# Git 仓库周报',
    })

    const config = await getReportConfig()
    const generated = await generateGitActivity({
      token: config.token,
      author: config.author,
      since: '2026-07-27',
      until: '2026-08-02',
      repos: config.repos,
    })

    expect(apiClient.get).toHaveBeenCalledWith('/api/report/config')
    expect(apiClient.post).toHaveBeenCalledWith('/api/report/generate', {
      token: 'token',
      author: 'Ledy',
      since: '2026-07-27',
      until: '2026-08-02',
      repos: config.repos,
    }, 180_000)
    expect(generated.markdown).toBe('# Git 仓库周报')
  })
})
