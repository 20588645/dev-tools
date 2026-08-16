import { afterEach, describe, expect, it, vi } from 'vitest'

import { createResizeDebouncer, createTerminalSessionId, partitionTerminalSessions, readThemeCssVar, tabIdForCommandName } from './terminal-helpers'

describe('terminal helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads theme tokens from body first so light mode is not stuck on :root dark values', () => {
    const rootValue = ['#', '12141c'].join('')
    const bodyValue = ['#', 'f4f6fb'].join('')
    document.documentElement.style.setProperty('--term-xterm-bg', rootValue)
    document.body.style.setProperty('--term-xterm-bg', bodyValue)
    expect(readThemeCssVar('--term-xterm-bg')).toBe(bodyValue)
    document.body.style.removeProperty('--term-xterm-bg')
    expect(readThemeCssVar('--term-xterm-bg')).toBe(rootValue)
    document.documentElement.style.removeProperty('--term-xterm-bg')
  })

  it('builds legacy-shaped session ids', () => {
    const id = createTerminalSessionId(1_704_067_200_000, () => 0.123456789)
    expect(id.startsWith('term-')).toBe(true)
    expect(id).toMatch(/^term-[0-9a-z]+[0-9a-z]{4}$/)
  })

  it('finds the latest tab named after a command', () => {
    expect(tabIdForCommandName([], 'LDTS 后端本地')).toBeUndefined()
    expect(tabIdForCommandName([
      { id: 't1', name: 'Terminal 1' },
      { id: 't2', name: 'LDTS 后端本地' },
      { id: 't3', name: 'LDTS 前端本地' },
      { id: 't4', name: 'LDTS 后端本地' },
    ], 'LDTS 后端本地')).toBe('t4')
  })

  it('keeps command-named sessions out of restore after an app restart', () => {
    const { restore, staleCommandTabs } = partitionTerminalSessions([
      { id: 'a', name: 'Terminal 2' },
      { id: 'b', name: 'LDTS 前端本地' },
      { id: 'c', name: 'LDTS 后端本地' },
    ], ['LDTS 前端本地', 'LDTS 后端本地'])
    expect(restore.map(item => item.id)).toEqual(['a'])
    expect(staleCommandTabs.map(item => item.name)).toEqual(['LDTS 前端本地', 'LDTS 后端本地'])
  })

  it('restores every session when no command names are loaded yet', () => {
    const sessions = [
      { id: 'a', name: 'Terminal 2' },
      { id: 'b', name: 'LDTS 前端本地' },
    ]
    const { restore, staleCommandTabs } = partitionTerminalSessions(sessions, [])
    expect(restore).toEqual(sessions)
    expect(staleCommandTabs).toEqual([])
  })

  it('debounces resize callbacks', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const debouncer = createResizeDebouncer(cb, 80)

    debouncer.schedule()
    debouncer.schedule()
    debouncer.schedule()
    expect(cb).not.toHaveBeenCalled()
    expect(debouncer.pending()).toBe(true)

    vi.advanceTimersByTime(79)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(debouncer.pending()).toBe(false)
  })

  it('flush runs immediately and clears the timer', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const debouncer = createResizeDebouncer(cb, 80)
    debouncer.schedule()
    debouncer.flush()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(debouncer.pending()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
