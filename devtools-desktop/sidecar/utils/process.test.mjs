// @vitest-environment node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { listDescendantPidsSync, killProcessTreeSync } = require('./process')

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function waitUntil(predicate, timeoutMs = 2000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('等待超时'))
      setTimeout(tick, 40)
    }
    tick()
  })
}

describe('killProcessTreeSync', () => {
  it('kills a child and its grandchild', async () => {
    const child = spawn(process.execPath, ['-e', `
      const { spawn } = require('child_process')
      const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      process.stdout.write(String(g.pid))
      setInterval(() => {}, 1000)
    `], { stdio: ['ignore', 'pipe', 'ignore'] })

    const grandchildPid = await new Promise((resolve, reject) => {
      let buf = ''
      child.stdout.on('data', (chunk) => {
        buf += String(chunk)
        const pid = Number(buf.trim())
        if (pid) resolve(pid)
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        if (!buf.trim()) reject(new Error(`启动子进程失败: ${code}`))
      })
    })

    expect(alive(child.pid)).toBe(true)
    expect(alive(grandchildPid)).toBe(true)
    expect(listDescendantPidsSync(child.pid)).toContain(grandchildPid)

    killProcessTreeSync(child.pid, 'SIGKILL')
    await waitUntil(() => !alive(child.pid) && !alive(grandchildPid))
    expect(alive(child.pid)).toBe(false)
    expect(alive(grandchildPid)).toBe(false)
  })
})
