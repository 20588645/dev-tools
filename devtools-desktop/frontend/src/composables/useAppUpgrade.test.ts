import { afterEach, describe, expect, it, vi } from 'vitest'

import { UPGRADE_PROGRESS_EVENT } from '@/services/app-events'

import { createAppUpgrade, resetAppUpgradeForTest } from './useAppUpgrade'

describe('useAppUpgrade', () => {
  afterEach(() => {
    resetAppUpgradeForTest()
    vi.useRealTimers()
  })

  it('keeps upgrade progress as an explicit task state machine', async () => {
    const startUpgrade = vi.fn().mockResolvedValue({ ok: true })
    const controller = createAppUpgrade({ startUpgrade, exitApp: vi.fn() })

    await controller.beginUpgrade()
    expect(startUpgrade).toHaveBeenCalledOnce()
    expect(controller.upgrade.state).toBe('running')

    controller.handleUpgradeProgress({ event: 'Progress', percent: 44, log: 'building\n' })
    expect(controller.upgrade).toMatchObject({
      state: 'running',
      percent: 44,
      log: expect.stringContaining('building'),
    })

    controller.handleUpgradeProgress({ event: 'Error', percent: 44, log: 'failed\n' })
    expect(controller.upgrade.state).toBe('error')
    expect(controller.upgrade.message).toContain('更新失败')
    controller.dispose()
  })

  it('ignores a second request while an update is already running', async () => {
    const controller = createAppUpgrade({
      startUpgrade: vi.fn().mockResolvedValue({ ok: true }),
      exitApp: vi.fn(),
    })
    await controller.beginUpgrade()
    controller.requestUpgrade()
    expect(controller.upgrade.state).toBe('running')
    controller.dispose()
  })

  it('listens to the shared progress event and exits after Finished', async () => {
    vi.useFakeTimers()
    const exitApp = vi.fn().mockResolvedValue(undefined)
    const controller = createAppUpgrade({
      startUpgrade: vi.fn().mockResolvedValue({ ok: true }),
      exitApp,
    })
    await controller.beginUpgrade()

    window.dispatchEvent(new CustomEvent(UPGRADE_PROGRESS_EVENT, {
      detail: { event: 'Finished', percent: 100, log: 'done\n' },
    }))
    expect(controller.upgrade.state).toBe('finished')
    await vi.advanceTimersByTimeAsync(500)
    expect(exitApp).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
