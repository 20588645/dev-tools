import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installPageLeaveGuardBridge,
  registerPageLeaveGuard,
  runPageLeaveGuards,
} from './legacy-bridge'

describe('page leave guard bridge', () => {
  afterEach(() => {
    delete window.__devtoolsRunPageLeaveGuards
  })

  it('allows leave when no guard is registered', async () => {
    await expect(runPageLeaveGuards('editor')).resolves.toBe(true)
    await expect(runPageLeaveGuards('not-a-page')).resolves.toBe(true)
  })

  it('registers, runs and unregisters an async guard', async () => {
    const guard = vi.fn().mockResolvedValue(false)
    const stop = registerPageLeaveGuard('editor', guard)

    await expect(runPageLeaveGuards('editor')).resolves.toBe(false)
    expect(guard).toHaveBeenCalledOnce()

    stop()
    await expect(runPageLeaveGuards('editor')).resolves.toBe(true)
  })

  it('fails closed when the guard throws', async () => {
    registerPageLeaveGuard('editor', () => {
      throw new Error('boom')
    })
    await expect(runPageLeaveGuards('editor')).resolves.toBe(false)
  })

  it('installs window bridge for legacy switchPage', async () => {
    registerPageLeaveGuard('editor', async () => false)
    const stop = installPageLeaveGuardBridge()
    expect(typeof window.__devtoolsRunPageLeaveGuards).toBe('function')
    await expect(window.__devtoolsRunPageLeaveGuards?.('editor')).resolves.toBe(false)
    stop()
    expect(window.__devtoolsRunPageLeaveGuards).toBeUndefined()
  })
})
