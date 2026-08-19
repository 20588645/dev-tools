import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavigationFailureType, isNavigationFailure } from 'vue-router'

import { registerPageLeaveGuard } from '@/router/page-contract'
import { createAppRouter } from '@/router'
import {
  listLeaveContract,
  pageIdFromRoute,
  shouldRunLeaveGuard,
} from '@/router/navigation-leave'

describe('leave contract catalog', () => {
  it('declares only editor as confirm; FT/terminal keepSession', () => {
    const rows = listLeaveContract()
    expect(rows.filter((r) => r.leavePolicy === 'confirm').map((r) => r.pageId)).toEqual(['editor'])
    expect(rows.find((r) => r.pageId === 'filetransfer')?.keepSession).toBe(true)
    expect(rows.find((r) => r.pageId === 'terminal')?.keepSession).toBe(true)
    expect(rows.find((r) => r.pageId === 'run')?.keepSession).toBe(false)
  })
})

describe('shouldRunLeaveGuard', () => {
  it('skips deploy sub-route switches with same pageId', async () => {
    const router = createAppRouter()
    await router.push('/deploy/dashboard')
    const from = { ...router.currentRoute.value }
    await router.push('/deploy/servers')
    const to = router.currentRoute.value
    expect(pageIdFromRoute(from)).toBe('deploy')
    expect(pageIdFromRoute(to)).toBe('deploy')
    expect(shouldRunLeaveGuard(from, to)).toBeNull()
  })

  it('detects leaving editor for another pageId', async () => {
    const router = createAppRouter()
    await router.push('/editor')
    const from = { ...router.currentRoute.value }
    await router.push('/run')
    const to = router.currentRoute.value
    // 用快照 from（离开前）与目标 to 对照；此处先无 guard，导航会成功
    expect(shouldRunLeaveGuard(from, to)).toBe('editor')
  })
})

describe('router beforeEach leave guard', () => {
  const stops: Array<() => void> = []

  afterEach(() => {
    while (stops.length) stops.pop()?.()
  })

  it('blocks navigation when editor guard returns false', async () => {
    stops.push(registerPageLeaveGuard('editor', async () => false))
    const router = createAppRouter()
    await router.push('/editor')
    expect(router.currentRoute.value.name).toBe('editor')

    const failure = await router.push('/run')
    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true)
    expect(router.currentRoute.value.name).toBe('editor')
  })

  it('allows navigation when editor guard returns true', async () => {
    const guard = vi.fn().mockResolvedValue(true)
    stops.push(registerPageLeaveGuard('editor', guard))
    const router = createAppRouter()
    await router.push('/editor')
    const failure = await router.push('/run')
    expect(failure).toBeUndefined()
    expect(guard).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('run')
  })
})
