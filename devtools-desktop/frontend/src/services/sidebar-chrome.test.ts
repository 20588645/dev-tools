import { describe, expect, it } from 'vitest'

import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_KEY,
  toggleSidebarCollapsed,
  writeSidebarCollapsed,
} from './sidebar-chrome'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

describe('sidebar-chrome', () => {
  it('defaults collapsed to false when unset', () => {
    const storage = createStorage()
    expect(readSidebarCollapsed(storage)).toBe(false)
  })

  it('persists collapse flag under shared key', () => {
    const storage = createStorage()
    writeSidebarCollapsed(true, storage)
    expect(storage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true')
    expect(readSidebarCollapsed(storage)).toBe(true)
    expect(toggleSidebarCollapsed(storage)).toBe(false)
    expect(readSidebarCollapsed(storage)).toBe(false)
  })
})
