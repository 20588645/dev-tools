import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/app-toast', () => ({
  showAppToast: vi.fn(),
}))

const { createExperimentalEffectsService } = await import('./experimental-effects-service')

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

function clickAt(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
}

let storage: Storage

beforeEach(() => {
  vi.useFakeTimers()
  storage = createMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createExperimentalEffectsService', () => {
  it('restores click particles from storage and cleans up on stop', () => {
    storage.setItem('devtools-click-effect-enabled', 'true')
    const service = createExperimentalEffectsService()
    service.start()

    clickAt(10, 20)
    expect(document.querySelectorAll('.click-particle').length).toBe(7)

    service.stop()
    document.body.innerHTML = ''
    clickAt(10, 20)
    expect(document.querySelectorAll('.click-particle').length).toBe(0)
  })

  it('toggles effects through the settings event', () => {
    const service = createExperimentalEffectsService()
    service.start()

    clickAt(5, 5)
    expect(document.querySelectorAll('.click-particle').length).toBe(0)

    window.dispatchEvent(new CustomEvent('devtools:experimental-setting-changed', {
      detail: { key: 'click-effect', enabled: true },
    }))
    clickAt(5, 5)
    expect(document.querySelectorAll('.click-particle').length).toBe(7)

    window.dispatchEvent(new CustomEvent('devtools:experimental-setting-changed', {
      detail: { key: 'live2d', enabled: true },
    }))
    expect(document.getElementById('live2d-widget-script')).not.toBeNull()

    service.stop()
  })

  it('restores live2d after the startup delay', () => {
    storage.setItem('devtools-live2d-enabled', 'true')
    const service = createExperimentalEffectsService()
    service.start()

    expect(document.getElementById('live2d-widget-script')).toBeNull()
    vi.advanceTimersByTime(1_500)
    expect(document.getElementById('live2d-widget-script')).not.toBeNull()

    service.stop()
  })

  it('stop before the delay cancels the live2d restore', () => {
    storage.setItem('devtools-live2d-enabled', 'true')
    const service = createExperimentalEffectsService()
    service.start()
    service.stop()

    vi.advanceTimersByTime(1_500)
    expect(document.getElementById('live2d-widget-script')).toBeNull()
  })
})
