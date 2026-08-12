import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createMigrationRouter } from '@/router'
import { getAppRouter, navigateToPage, setAppRouter } from '@/router/navigate'

describe('navigateToPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setAppRouter(createMigrationRouter())
  })

  it('pushes catalog path for known pageIds', async () => {
    await navigateToPage('run')
    expect(getAppRouter()?.currentRoute.value.path).toBe('/run')
    await navigateToPage('settings')
    expect(getAppRouter()?.currentRoute.value.path).toBe('/settings')
  })

  it('navigates home to /', async () => {
    await navigateToPage('home')
    expect(getAppRouter()?.currentRoute.value.path).toBe('/')
  })
})
