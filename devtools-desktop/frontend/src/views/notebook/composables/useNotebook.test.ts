import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  NotebookRecord,
  NotebookSummary,
  NotebookUpdateInput,
} from '@/services/modules/notebook-service'

import { useNotebook } from './useNotebook'

type Controller = ReturnType<typeof useNotebook>

function record(id: string, content = '<p>初始正文</p>'): NotebookRecord {
  return {
    id,
    title: `笔记 ${id}`,
    content,
    preview: '初始正文',
    pinned: false,
    sortOrder: 0,
    hasMedia: false,
    createdAt: '2026-07-28T05:00:00.000Z',
    updatedAt: '2026-07-28T05:00:00.000Z',
  }
}

function summary(id: string): NotebookSummary {
  const value = record(id)
  const { content: _content, ...result } = value
  return result
}

function mountNotebook(
  overrides: NonNullable<Parameters<typeof useNotebook>[0]>['services'] = {},
) {
  let controller: Controller | undefined
  const services = {
    list: vi.fn(async () => [summary('one'), summary('two')]),
    get: vi.fn(async (id: string) => record(id)),
    create: vi.fn(async () => record('created', '')),
    update: vi.fn(async (id: string, input: NotebookUpdateInput) => ({
      ...record(id, input.content),
      title: input.title ?? '',
      pinned: input.pinned ?? false,
      updatedAt: '2026-07-28T05:01:00.000Z',
    })),
    remove: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    ...overrides,
  }
  const wrapper = mount(defineComponent({
    setup() {
      controller = useNotebook({ services, saveDelay: 800, searchDelay: 280 })
      return () => h('div')
    },
  }))
  return {
    services,
    wrapper,
    get controller() {
      if (!controller) throw new Error('notebook composable did not initialize')
      return controller
    },
  }
}

async function settle() {
  await flushPromises()
  await nextTick()
}

describe('useNotebook', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  it('saves the current note 800ms after the latest edit', async () => {
    vi.useFakeTimers()
    const mounted = mountNotebook()
    wrapper = mounted.wrapper
    await settle()

    mounted.controller.updateCurrent('content', '<p>新的正文</p>')
    await vi.advanceTimersByTimeAsync(799)
    expect(mounted.services.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settle()

    expect(mounted.services.update).toHaveBeenCalledWith('one', expect.objectContaining({
      content: '<p>新的正文</p>',
    }))
    expect(mounted.controller.currentDraft.value?.saveState).toBe('saved')
  })

  it('flushes the draft before applying a new search', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const mounted = mountNotebook({
      list: vi.fn(async (query = '') => {
        calls.push(`list:${query}`)
        return [summary('one')]
      }),
      update: vi.fn(async (id: string, input: NotebookUpdateInput) => {
        calls.push(`save:${id}:${input.content}`)
        return { ...record(id, input.content), title: input.title ?? '', pinned: Boolean(input.pinned) }
      }),
    })
    wrapper = mounted.wrapper
    await settle()

    mounted.controller.updateCurrent('content', '<p>搜索前保存</p>')
    mounted.controller.search.value = '关键字'
    await vi.advanceTimersByTimeAsync(280)
    await settle()

    expect(calls).toContain('save:one:<p>搜索前保存</p>')
    expect(calls.indexOf('save:one:<p>搜索前保存</p>')).toBeLessThan(calls.indexOf('list:关键字'))
  })

  it('serializes saves and keeps a newer revision dirty until its own response returns', async () => {
    vi.useFakeTimers()
    const resolvers: Array<() => void> = []
    const update = vi.fn((id: string, input: NotebookUpdateInput) => new Promise<NotebookRecord>((resolve) => {
      resolvers.push(() => resolve({ ...record(id, input.content), title: input.title ?? '', pinned: Boolean(input.pinned) }))
    }))
    const mounted = mountNotebook({ update })
    wrapper = mounted.wrapper
    await settle()

    mounted.controller.updateCurrent('content', '<p>第一版</p>')
    await vi.advanceTimersByTimeAsync(800)
    await nextTick()
    mounted.controller.updateCurrent('content', '<p>第二版</p>')
    await vi.advanceTimersByTimeAsync(800)
    expect(update).toHaveBeenCalledTimes(1)

    resolvers[0]()
    await settle()
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1][1].content).toBe('<p>第二版</p>')
    expect(mounted.controller.currentDraft.value?.saveState).toBe('saving')

    resolvers[1]()
    await settle()
    expect(mounted.controller.currentDraft.value?.saveState).toBe('saved')
  })

  it('does not let a stale detail response replace the newly selected note', async () => {
    const resolvers = new Map<string, (value: NotebookRecord) => void>()
    const mounted = mountNotebook({
      get: vi.fn((id: string) => new Promise<NotebookRecord>((resolve) => resolvers.set(id, resolve))),
    })
    wrapper = mounted.wrapper
    await nextTick()

    const selection = mounted.controller.selectNote('two')
    await nextTick()
    await Promise.resolve()
    resolvers.get('one')?.(record('one', '<p>过期响应</p>'))
    resolvers.get('two')?.(record('two', '<p>当前响应</p>'))
    await selection
    await settle()

    expect(mounted.controller.currentId.value).toBe('two')
    expect(mounted.controller.currentDraft.value?.content).toBe('<p>当前响应</p>')
  })

  it('keeps an unsaved session draft when a forced detail retry is requested', async () => {
    const mounted = mountNotebook()
    wrapper = mounted.wrapper
    await settle()

    mounted.controller.updateCurrent('content', '<p>本次会话草稿</p>')
    await mounted.controller.retryCurrentLoad()
    await settle()

    expect(mounted.services.get).toHaveBeenCalledTimes(1)
    expect(mounted.controller.currentDraft.value?.content).toBe('<p>本次会话草稿</p>')
    expect(mounted.controller.currentDraft.value?.saveState).toBe('dirty')
  })
})
