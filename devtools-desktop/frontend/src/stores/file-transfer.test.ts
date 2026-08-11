import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DeployServer } from '@/services/modules/deploy-service'

import { useFileTransferStore } from './file-transfer'

const server = (id: string, name = id): DeployServer => ({
  id,
  name,
  host: `${id}.example`,
  port: 22,
  username: 'root',
  authType: 'password',
  passwordMasked: '******',
  defaultRemotePath: '/home',
  deployPaths: [],
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useFileTransferStore.applyTransferEvent / registerTask', () => {
  it('WS started 早于 HTTP 返回时，registerTask 能回填 sessionId', () => {
    const store = useFileTransferStore()

    store.applyTransferEvent({
      taskId: 'task-1',
      direction: 'upload',
      phase: 'started',
      filesTotal: 2,
    })

    expect(store.tasks['task-1']).toBeTruthy()
    expect(store.tasks['task-1'].sessionId).toBeUndefined()
    expect(store.tasks['task-1'].state).toBe('transferring')

    store.registerTask('task-1', {
      direction: 'upload',
      sessionId: 'sid-abc',
      serverName: 'prod',
      curName: 'readme.md',
    })

    expect(store.tasks['task-1'].sessionId).toBe('sid-abc')
    expect(store.tasks['task-1'].serverName).toBe('prod')
    expect(store.tasks['task-1'].curName).toBe('readme.md')
  })
})

describe('useFileTransferStore.switchTab', () => {
  it('切 tab 保存并恢复各自的远程 path/items', () => {
    const store = useFileTransferStore()
    const tabA = store.makeTab('sid-a', server('a', 'Alpha'))
    tabA.path = '/var/www'
    tabA.items = [{ name: 'a.txt', size: 1, mtime: 0, isDir: false, isSymlink: false, isFile: true }]
    const tabB = store.makeTab('sid-b', server('b', 'Beta'))
    tabB.path = '/tmp'
    tabB.items = [{ name: 'b.bin', size: 2, mtime: 0, isDir: false, isSymlink: false, isFile: true }]
    store.tabs = [tabA, tabB]
    store.activeTabId = tabA.id

    expect(store.remotePath).toBe('/var/www')
    expect(store.remoteItems.map((it) => it.name)).toEqual(['a.txt'])

    store.switchTab(tabB.id)
    expect(store.activeTabId).toBe(tabB.id)
    expect(store.remotePath).toBe('/tmp')
    expect(store.remoteItems.map((it) => it.name)).toEqual(['b.bin'])

    store.switchTab(tabA.id)
    expect(store.remotePath).toBe('/var/www')
    expect(store.remoteItems.map((it) => it.name)).toEqual(['a.txt'])
  })
})
