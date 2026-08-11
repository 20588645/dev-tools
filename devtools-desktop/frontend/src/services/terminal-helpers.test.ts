import { afterEach, describe, expect, it, vi } from 'vitest'

import { createResizeDebouncer, createTerminalSessionId } from './terminal-helpers'

describe('terminal helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds legacy-shaped session ids', () => {
    const id = createTerminalSessionId(1_704_067_200_000, () => 0.123456789)
    expect(id.startsWith('term-')).toBe(true)
    expect(id).toMatch(/^term-[0-9a-z]+[0-9a-z]{4}$/)
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
