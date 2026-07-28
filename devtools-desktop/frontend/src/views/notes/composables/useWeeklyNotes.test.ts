import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NoteRecord, NoteWriteInput } from '@/services/modules/notes-service'
import {
  formatLocalDate,
  getIsoWeekNumber,
  getWeekDates,
  useWeeklyNotes,
} from './useWeeklyNotes'

type Controller = ReturnType<typeof useWeeklyNotes>

function emptyRecord(date: string, title = '', content = ''): NoteRecord {
  return {
    date,
    title,
    content,
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
  }
}

function mountWeeklyNotes(options: Parameters<typeof useWeeklyNotes>[0]) {
  let controller: Controller | undefined
  const storage = new Map<string, string>()
  const resolvedOptions = options ?? {}
  const wrapper = mount(defineComponent({
    setup() {
      controller = useWeeklyNotes({
        ...resolvedOptions,
        storage: resolvedOptions.storage ?? {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value),
        },
      })
      return () => h('div')
    },
  }))
  return {
    wrapper,
    get controller() {
      if (!controller) throw new Error('composable did not initialize')
      return controller
    },
  }
}

async function settleInitialLoad() {
  await flushPromises()
  await nextTick()
}

describe('weekly notes date helpers', () => {
  it('uses the previous Monday when the anchor is Sunday', () => {
    expect(getWeekDates(new Date(2026, 6, 26))).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ])
  })

  it('keeps local date formatting and ISO week numbering stable', () => {
    expect(formatLocalDate(new Date(2026, 6, 27))).toBe('2026-07-27')
    expect(getIsoWeekNumber(new Date(2026, 6, 27))).toBe(31)
  })
})

describe('useWeeklyNotes', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  it('saves one date 800ms after the last edit', async () => {
    vi.useFakeTimers()
    const persistNote = vi.fn(async (input: NoteWriteInput) => emptyRecord(input.date, input.title, input.content))
    const mounted = mountWeeklyNotes({
      now: () => new Date(2026, 6, 27, 15, 28),
      getNote: async () => null,
      persistNote,
    })
    wrapper = mounted.wrapper
    await settleInitialLoad()

    mounted.controller.updateNote('2026-07-27', 'title', '迁移 Notes 页面')
    await vi.advanceTimersByTimeAsync(799)
    expect(persistNote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(persistNote).toHaveBeenCalledWith({
      date: '2026-07-27',
      title: '迁移 Notes 页面',
      content: '',
    })
    expect(mounted.controller.selectedDay.value.note.saveState).toBe('saved')
  })

  it('flushes the current date immediately before selecting another date', async () => {
    vi.useFakeTimers()
    const persistNote = vi.fn(async (input: NoteWriteInput) => emptyRecord(input.date, input.title, input.content))
    const mounted = mountWeeklyNotes({
      now: () => new Date(2026, 6, 27, 15, 28),
      getNote: async () => null,
      persistNote,
    })
    wrapper = mounted.wrapper
    await settleInitialLoad()

    mounted.controller.updateNote('2026-07-27', 'content', '切换前保存')
    mounted.controller.selectDate('2026-07-28')
    await flushPromises()

    expect(persistNote).toHaveBeenCalledTimes(1)
    expect(persistNote).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-07-27',
      content: '切换前保存',
    }))
  })

  it('serializes saves and does not let an older response mark newer text as saved', async () => {
    vi.useFakeTimers()
    const resolvers: Array<() => void> = []
    const persistNote = vi.fn((input: NoteWriteInput) => new Promise<NoteRecord>((resolve) => {
      resolvers.push(() => resolve(emptyRecord(input.date, input.title, input.content)))
    }))
    const mounted = mountWeeklyNotes({
      now: () => new Date(2026, 6, 27, 15, 28),
      getNote: async () => null,
      persistNote,
    })
    wrapper = mounted.wrapper
    await settleInitialLoad()

    mounted.controller.updateNote('2026-07-27', 'content', '第一版')
    await vi.advanceTimersByTimeAsync(800)
    await nextTick()
    expect(persistNote).toHaveBeenCalledTimes(1)

    mounted.controller.updateNote('2026-07-27', 'content', '第二版')
    await vi.advanceTimersByTimeAsync(800)
    expect(persistNote).toHaveBeenCalledTimes(1)

    resolvers[0]()
    await flushPromises()
    expect(persistNote).toHaveBeenCalledTimes(2)
    expect(mounted.controller.selectedDay.value.note.saveState).toBe('saving')
    expect(persistNote.mock.calls[1][0].content).toBe('第二版')

    resolvers[1]()
    await flushPromises()
    expect(mounted.controller.selectedDay.value.note.saveState).toBe('saved')
    expect(mounted.controller.selectedDay.value.note.savedRevision).toBe(2)
  })

  it('ignores an older week response after rapid navigation', async () => {
    const requests = new Map<string, Array<(record: NoteRecord | null) => void>>()
    const getNote = vi.fn((date: string) => new Promise<NoteRecord | null>((resolve) => {
      requests.set(date, [...(requests.get(date) ?? []), resolve])
    }))
    const mounted = mountWeeklyNotes({
      now: () => new Date(2026, 6, 27, 15, 28),
      getNote,
      persistNote: async (input) => emptyRecord(input.date, input.title, input.content),
    })
    wrapper = mounted.wrapper
    await nextTick()

    mounted.controller.changeWeek(1)
    await nextTick()
    requests.get('2026-07-27')?.[0](emptyRecord('2026-07-27', '旧周响应', '不应生效'))
    for (const date of getWeekDates(new Date(2026, 6, 27), 1)) {
      requests.get(date)?.[0](emptyRecord(date, date === '2026-08-03' ? '新周内容' : '', ''))
    }
    await settleInitialLoad()

    expect(mounted.controller.weekDates.value[0]).toBe('2026-08-03')
    expect(mounted.controller.days.value[0].note.title).toBe('新周内容')
    mounted.controller.changeWeek(-1)
    await nextTick()
    expect(mounted.controller.days.value[0].note.title).not.toBe('旧周响应')
  })

  it('never overwrites an in-session draft when its load finishes later', async () => {
    let resolveToday: ((record: NoteRecord | null) => void) | undefined
    const getNote = vi.fn((date: string) => {
      if (date === '2026-07-27') {
        return new Promise<NoteRecord | null>((resolve) => {
          resolveToday = resolve
        })
      }
      return Promise.resolve(null)
    })
    const mounted = mountWeeklyNotes({
      now: () => new Date(2026, 6, 27, 15, 28),
      getNote,
      persistNote: async (input) => emptyRecord(input.date, input.title, input.content),
    })
    wrapper = mounted.wrapper
    await nextTick()

    mounted.controller.updateNote('2026-07-27', 'content', '当前会话草稿')
    resolveToday?.(emptyRecord('2026-07-27', '服务端旧标题', '服务端旧正文'))
    await settleInitialLoad()

    expect(mounted.controller.selectedDay.value.note.content).toBe('当前会话草稿')
    expect(mounted.controller.selectedDay.value.note.title).toBe('')
    expect(mounted.controller.selectedDay.value.note.saveState).toBe('dirty')
  })
})
