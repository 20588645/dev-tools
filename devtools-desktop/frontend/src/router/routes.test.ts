import { describe, expect, it } from 'vitest'

import { APP_PAGE_IDS } from '@/router/page-contract'
import { createAppRouter } from '@/router'
import {
  DEFAULT_MENU_ORDER,
  NAV_CATALOG,
  buildSidebarOrder,
  keepAliveNamesFromCatalog,
  normalizeMenuOrder,
} from '@/router/route-meta'
import { appRoutes } from '@/router/routes'

describe('route-meta catalog', () => {
  it('covers every page id exactly once in NAV_CATALOG', () => {
    const ids = NAV_CATALOG.map((item) => item.pageId)
    expect(ids.sort()).toEqual([...APP_PAGE_IDS].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('marks only editor with leave confirm; FT/terminal keepSession', () => {
    expect(NAV_CATALOG.find((i) => i.pageId === 'editor')?.leavePolicy).toBe('confirm')
    expect(NAV_CATALOG.filter((i) => i.leavePolicy === 'confirm')).toHaveLength(1)
    expect(NAV_CATALOG.find((i) => i.pageId === 'filetransfer')?.keepSession).toBe(true)
    expect(NAV_CATALOG.find((i) => i.pageId === 'terminal')?.keepSession).toBe(true)
  })

  it('normalizes menu order against DEFAULT_MENU_ORDER', () => {
    expect(normalizeMenuOrder(undefined)).toEqual(DEFAULT_MENU_ORDER)
    expect(normalizeMenuOrder(['usage', 'run', 'usage', 'nope'])).toEqual([
      'usage',
      'run',
      ...DEFAULT_MENU_ORDER.filter((p) => p !== 'usage' && p !== 'run'),
    ])
    expect(buildSidebarOrder(['todo'])).toEqual([
      'home',
      'todo',
      ...DEFAULT_MENU_ORDER.filter((p) => p !== 'todo'),
      'settings',
    ])
  })

  it('lists KeepAlive component names including deploy children', () => {
    const names = keepAliveNamesFromCatalog()
    expect(names).toContain('HomeView')
    expect(names).toContain('FileEditorView')
    expect(names).toContain('DeployDashboardView')
    expect(names).toContain('DeployServersView')
    expect(names).toContain('DeployHistoryView')
  })
})

describe('appRoutes', () => {
  it('registers top-level routes for all nav pages and deploy children', () => {
    const names = appRoutes.map((r) => r.name).filter(Boolean)
    for (const page of APP_PAGE_IDS) {
      expect(names).toContain(page)
    }
    expect(names).toContain('deploy-dashboard')
    expect(names).toContain('deploy-servers')
    expect(names).toContain('deploy-history')
  })

  it('resolves hash paths via createAppRouter', async () => {
    const router = createAppRouter()
    await router.push('/editor')
    expect(router.currentRoute.value.name).toBe('editor')
    expect(router.currentRoute.value.meta.leavePolicy).toBe('confirm')
    expect(router.currentRoute.value.meta.keepAliveName).toBe('FileEditorView')

    await router.push('/deploy')
    expect(router.currentRoute.value.name).toBe('deploy-dashboard')
    expect(router.currentRoute.value.meta.deploySub).toBe('dashboard')

    await router.push('/deploy/servers')
    expect(router.currentRoute.value.name).toBe('deploy-servers')

    await router.push('/no-such-page')
    expect(router.currentRoute.value.name).toBe('home')
  })
})
