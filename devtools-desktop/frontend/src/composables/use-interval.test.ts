import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useInterval } from './use-interval'

describe('useInterval', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('supports manually started intervals and clears them on unmount', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    let start = () => {}

    const wrapper = mount(defineComponent({
      setup() {
        const interval = useInterval(callback, 1_000, { autoStart: false })
        start = interval.start
        return () => h('div')
      },
    }))

    vi.advanceTimersByTime(1_100)
    expect(callback).not.toHaveBeenCalled()

    start()
    vi.advanceTimersByTime(1_100)
    expect(callback).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    vi.advanceTimersByTime(1_100)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
