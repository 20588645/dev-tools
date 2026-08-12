import { describe, expect, it } from 'vitest'

import { DEFAULT_MENU_ORDER } from '@/router/route-meta'

import { NAV_ICONS } from './nav-icons'
import { resolveSidebarNavItems } from './sidebar-nav'

describe('resolveSidebarNavItems', () => {
  it('returns home first and settings last with default middle order', () => {
    const items = resolveSidebarNavItems()
    expect(items[0]?.pageId).toBe('home')
    expect(items[items.length - 1]?.pageId).toBe('settings')
    expect(items.slice(1, -1).map((i) => i.pageId)).toEqual([...DEFAULT_MENU_ORDER])
  })

  it('respects custom middle order', () => {
    const items = resolveSidebarNavItems(['usage', 'run'])
    const middle = items.slice(1, -1).map((i) => i.pageId)
    expect(middle[0]).toBe('usage')
    expect(middle[1]).toBe('run')
    expect(middle).toContain('todo')
  })

  it('attaches SVG icons for every nav page', () => {
    const items = resolveSidebarNavItems()
    for (const item of items) {
      expect(item.iconSvg.length).toBeGreaterThan(20)
      expect(item.iconSvg).toContain('<svg')
      expect(NAV_ICONS[item.pageId]).toBeTruthy()
    }
  })
})
