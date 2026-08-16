import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useTerminalStore } from './terminal'

describe('terminal store running commands', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes running command ids from the live sidecar map, not from tab names', () => {
    const store = useTerminalStore()
    store.setTabs([{ id: 'term-stale', name: 'LDTS 前端本地' }], 'term-stale')
    expect(store.runningCommandIds).toEqual([])

    store.setRunningByCommandId({ 'cmd-front': 'term-live', 'cmd-back': 'term-2' })
    expect(store.runningCommandIds.sort()).toEqual(['cmd-back', 'cmd-front'])

    store.setRunningByCommandId({})
    expect(store.runningCommandIds).toEqual([])
  })
})
