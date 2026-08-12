import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  registerPageLeaveGuard,
  runPageLeaveGuards,
} from './legacy-bridge'

describe('page leave guards', () => {
  afterEach(() => {
    // ensure clean map by registering then unregistering dummy
    registerPageLeaveGuard('editor', () => true)()
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
})
