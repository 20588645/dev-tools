import { describe, expect, it } from 'vitest'

import { enclosingAppPath, extractDroppedAppPath, looksLikeAppPath, normalizeDroppedPath, relatedInstallImage } from './appfix-path'

describe('appfix path helpers', () => {
  it('normalizes file URLs and trailing slashes', () => {
    expect(normalizeDroppedPath('file:///Applications/Demo.app/')).toBe('/Applications/Demo.app')
    expect(looksLikeAppPath('/Applications/Demo.app/')).toBe(true)
    expect(looksLikeAppPath('/tmp/notes.txt')).toBe(false)
  })

  it('walks dropped inner files back to the app bundle', () => {
    expect(enclosingAppPath('/Applications/Demo.app/Contents/MacOS/Demo')).toBe('/Applications/Demo.app')
    expect(extractDroppedAppPath([
      '/tmp/readme.txt',
      '/Applications/Demo.app/Contents/Info.plist',
    ])).toBe('/Applications/Demo.app')
  })

  it('relates an app to a mounted install image', () => {
    const image = {
      mounts: [{ mountPoint: '/Volumes/Demo' }],
      apps: [{ name: 'Demo' }],
    }
    expect(relatedInstallImage('/Volumes/Demo/Demo.app', [image])?.onImage).toBe(true)
    expect(relatedInstallImage('/Applications/Demo.app', [image])?.onImage).toBe(false)
    expect(relatedInstallImage('/Applications/Other.app', [image])).toBeNull()
  })
})
