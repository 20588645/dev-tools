import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/services/modules/settings-service', () => ({
  getHealth: vi.fn(),
}))

const { getHealth } = await import('@/services/modules/settings-service')
const { useProjectIntro } = await import('./useProjectIntro')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(getHealth).mockReset()
})

describe('useProjectIntro', () => {
  it('refreshes version and healthy sidecar when dialog opens', async () => {
    vi.mocked(getHealth).mockResolvedValue({
      status: 'ok',
      uptime: 12,
      pid: 1,
      version: '0.1.93',
      dataDir: '/tmp',
    })
    const open = ref(false)
    const intro = useProjectIntro(open)
    open.value = true
    await vi.waitFor(() => expect(intro.version.value).toBe('0.1.93'))
    expect(intro.sidecarLabel.value).toBe('正常')
    expect(intro.sidecarClass.value).toBe('ok')
  })

  it('marks sidecar as disconnected when health fails', async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error('offline'))
    const open = ref(false)
    const intro = useProjectIntro(open)
    open.value = true
    await vi.waitFor(() => expect(intro.sidecarLabel.value).toBe('未连接'))
    expect(intro.sidecarClass.value).toBe('danger')
  })
})
