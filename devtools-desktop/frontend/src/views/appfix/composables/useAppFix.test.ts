import { describe, expect, it } from 'vitest'

import { resultSummary, settleSummary } from './useAppFix'

describe('resultSummary', () => {
  const base = {
    path: '/Applications/Demo.app',
    name: 'Demo',
    attributes: [],
    remaining: [],
    hasQuarantine: false,
  }

  it('prefers the quarantine-cleared message', () => {
    expect(resultSummary({
      ...base,
      hadQuarantine: true,
      cleared: ['com.apple.quarantine'],
    })).toContain('已清除隔离属性')
  })

  it('explains a generic attribute clear when quarantine was absent', () => {
    expect(resultSummary({
      ...base,
      hadQuarantine: false,
      cleared: ['com.apple.macl'],
    })).toContain('不是隔离标记问题')
  })
})

describe('settleSummary', () => {
  const base = {
    path: '/Applications/Demo.app',
    name: 'Demo',
    copied: false,
    copySkipped: false,
    ejected: false,
    ejectError: '',
    volumeName: 'Demo',
    imagePath: '/tmp/Demo.dmg',
    mountPoint: '/Volumes/Demo',
    onImage: false,
    repair: null,
  }

  it('prefers copy-and-eject, then leftover-eject', () => {
    expect(settleSummary({ ...base, copied: true, ejected: true })).toContain('拷到应用程序并推出')
    expect(settleSummary({ ...base, ejected: true })).toContain('已推出安装镜像')
    expect(settleSummary({ ...base, copied: true, ejectError: '镜像正在使用，请先退出里面的应用再推出' })).toContain('未能推出')
  })
})
