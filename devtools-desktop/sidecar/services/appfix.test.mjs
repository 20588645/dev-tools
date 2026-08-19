// @vitest-environment node
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { createRequire } from 'node:module'

import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseXattrList, repairApp, resolveAppBundle, imagesFromInfo, findRelatedImage, collectInstallImages, ejectDiskImage, settleInstall } = require('./appfix')

const temps = []

function fakeApp(name = 'Demo.app') {
  const root = mkdtempSync(join(tmpdir(), 'appfix-'))
  temps.push(root)
  const bundle = join(root, name)
  mkdirSync(join(bundle, 'Contents'), { recursive: true })
  writeFileSync(join(bundle, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist></plist>\n')
  return bundle
}

function mockExecFile(script) {
  return (command, args, _options, callback) => {
    try {
      const result = script(command, args)
      callback(null, result?.stdout ?? '', result?.stderr ?? '')
    } catch (error) {
      callback(error, error.stdout || '', error.stderr || '')
    }
  }
}

afterEach(() => {
  while (temps.length) {
    rmSync(temps.pop(), { recursive: true, force: true })
  }
})

describe('parseXattrList', () => {
  it('reads attribute names from xattr -l output', () => {
    expect(parseXattrList('com.apple.quarantine: 0081;\ncom.apple.macl: 0\n')).toEqual([
      'com.apple.quarantine',
      'com.apple.macl',
    ])
  })
})

describe('resolveAppBundle', () => {
  it('accepts a directory that looks like a macOS app bundle', () => {
    const bundle = fakeApp()
    expect(resolveAppBundle(bundle)).toBe(fs.realpathSync(bundle))
  })

  it('rejects missing paths, non-app files, and incomplete bundles', () => {
    expect(() => resolveAppBundle('')).toThrow('请选择或输入 .app 路径')
    expect(() => resolveAppBundle('/tmp/no-such-app.app')).toThrow('找不到这个应用')

    const root = mkdtempSync(join(tmpdir(), 'appfix-'))
    temps.push(root)
    const notApp = join(root, 'notes.txt')
    writeFileSync(notApp, 'nope')
    expect(() => resolveAppBundle(notApp)).toThrow('请选择以 .app 结尾的应用包')

    const incomplete = join(root, 'Empty.app')
    mkdirSync(incomplete)
    expect(() => resolveAppBundle(incomplete)).toThrow('应用包不完整')
  })

  it('blocks system prefixes even when the path looks like an app', () => {
    const deps = {
      os: { homedir: () => '/Users/demo' },
      path,
      fs: {
        realpathSync: () => '/System/Applications/Safari.app',
        statSync: () => ({ isDirectory: () => true, isFile: () => true }),
      },
    }
    expect(() => resolveAppBundle('/System/Applications/Safari.app', deps)).toThrow('系统目录不能修复')
  })
})

describe('repairApp', () => {
  it('refuses to run off macOS', async () => {
    await expect(repairApp('/tmp/Demo.app', { platform: 'linux' })).rejects.toThrow('此功能仅支持 macOS')
  })

  it('clears extended attributes with execFile, never a shell string', async () => {
    const bundle = fakeApp()
    const calls = []
    let listed = 0
    const deps = {
      platform: 'darwin',
      fs,
      os,
      path,
      execFile: mockExecFile((command, args) => {
        calls.push([command, [...args]])
        expect(command).toBe('xattr')
        if (args[0] === '-l') {
          listed += 1
          return { stdout: listed === 1 ? 'com.apple.quarantine: 0081;\n' : '' }
        }
        if (args[0] === '-cr') return { stdout: '' }
        throw new Error(`unexpected xattr ${args.join(' ')}`)
      }),
    }

    const result = await repairApp(bundle, deps)
    const resolved = result.path

    expect(calls[0]).toEqual(['xattr', ['-l', resolved]])
    expect(calls[1]).toEqual(['xattr', ['-cr', resolved]])
    expect(calls[2]).toEqual(['xattr', ['-l', resolved]])
    expect(result).toMatchObject({
      path: resolved,
      name: 'Demo',
      hadQuarantine: true,
      hasQuarantine: false,
      cleared: ['com.apple.quarantine'],
    })
  })
})

const sampleInfo = {
  images: [
    {
      'image-path': '/Users/demo/Downloads/Demo.dmg',
      'system-entities': [
        { 'dev-entry': '/dev/disk4' },
        { 'dev-entry': '/dev/disk4s1', 'mount-point': '/Volumes/Demo' },
      ],
    },
  ],
}

describe('disk image helpers', () => {
  it('reads mounted disk images and ignores entries without a mount point', () => {
    expect(imagesFromInfo(sampleInfo)).toEqual([
      {
        imagePath: '/Users/demo/Downloads/Demo.dmg',
        imageName: 'Demo.dmg',
        volumeName: 'Demo',
        mounts: [
          { mountPoint: '/Volumes/Demo', devEntry: '/dev/disk4s1' },
        ],
      },
    ])
  })

  it('relates an app still on the image, or the same app already copied away', () => {
    const volume = mkdtempSync(join(tmpdir(), 'appfix-vol-'))
    temps.push(volume)
    const bundle = join(volume, 'Demo.app')
    mkdirSync(join(bundle, 'Contents'), { recursive: true })
    writeFileSync(join(bundle, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist></plist>\n')

    const images = collectInstallImages({
      images: [{
        'image-path': '/Users/demo/Downloads/Demo.dmg',
        'system-entities': [{ 'dev-entry': '/dev/disk4s1', 'mount-point': volume }],
      }],
    })
    expect(images[0].apps[0].name).toBe('Demo')
    expect(findRelatedImage(bundle, images)).toMatchObject({ onImage: true })
    expect(findRelatedImage('/Applications/Demo.app', images)).toMatchObject({ onImage: false })
    expect(findRelatedImage('/Applications/Other.app', images)).toBeNull()
  })
})

describe('ejectDiskImage', () => {
  it('only detaches volumes that hdiutil lists as disk images', async () => {
    const calls = []
    const deps = {
      platform: 'darwin',
      fs: { realpathSync: (value) => value },
      readDiskImages: async () => sampleInfo,
      execFile: mockExecFile((command, args) => {
        calls.push([command, [...args]])
        expect(command).toBe('hdiutil')
        expect(args[0]).toBe('detach')
        return { stdout: '' }
      }),
    }
    await expect(ejectDiskImage('/Volumes/USB', deps)).rejects.toThrow('这不是已挂载的安装镜像')
    await expect(ejectDiskImage('/Volumes/Demo', deps)).resolves.toMatchObject({
      ejected: true,
      volumeName: 'Demo',
      imagePath: '/Users/demo/Downloads/Demo.dmg',
    })
    expect(calls).toEqual([['hdiutil', ['detach', '/Volumes/Demo']]])
  })
})

describe('settleInstall', () => {
  it('copies an app off the image, clears attributes, then ejects', async () => {
    const volume = mkdtempSync(join(tmpdir(), 'appfix-vol-'))
    const appsDir = mkdtempSync(join(tmpdir(), 'appfix-apps-'))
    temps.push(volume, appsDir)
    const bundle = join(volume, 'Demo.app')
    mkdirSync(join(bundle, 'Contents'), { recursive: true })
    writeFileSync(join(bundle, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist></plist>\n')
    const dest = join(appsDir, 'Demo.app')

    const calls = []
    const deps = {
      platform: 'darwin',
      fs,
      os,
      path,
      applicationsDir: appsDir,
      readDiskImages: async () => ({
        images: [{
          'image-path': '/Users/demo/Downloads/Demo.dmg',
          'system-entities': [{ 'dev-entry': '/dev/disk4s1', 'mount-point': volume }],
        }],
      }),
      execFile: mockExecFile((command, args) => {
        calls.push([command, args[0], args[1]])
        if (command === 'ditto') {
          mkdirSync(join(dest, 'Contents'), { recursive: true })
          writeFileSync(join(dest, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist></plist>\n')
          return { stdout: '' }
        }
        if (command === 'xattr' && args[0] === '-l') return { stdout: 'com.apple.quarantine: 0081;\n' }
        if (command === 'xattr' && args[0] === '-cr') return { stdout: '' }
        if (command === 'hdiutil' && args[0] === 'detach') return { stdout: '' }
        throw new Error(`unexpected ${command} ${args.join(' ')}`)
      }),
    }

    const result = await settleInstall(bundle, deps)
    expect(result).toMatchObject({
      copied: true,
      ejected: true,
      copySkipped: false,
      path: dest,
      name: 'Demo',
    })
    expect(calls[0][0]).toBe('ditto')
    expect(calls[0][1]).toBe(fs.realpathSync(bundle))
    expect(calls[0][2]).toBe(dest)
    expect(calls.some((call) => call[0] === 'hdiutil' && call[1] === 'detach')).toBe(true)
  })
})
