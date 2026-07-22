import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient } from './api-client'

describe('ApiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the browser receiver required by native fetch', async () => {
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response('{"ok":true}', {
        headers: { 'content-type': 'application/json' },
      }))
    })
    vi.stubGlobal('fetch', browserFetch)
    const client = new ApiClient()

    await expect(client.get<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
    expect(browserFetch).toHaveBeenCalledOnce()
  })

  it('uses the browser apiPort override and parses JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    }))
    const client = new ApiClient({ fetcher })

    await expect(client.get<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:13456/api/health', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
  })

  it('maps HTTP failures to ApiError with response details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"bad request"}', {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new ApiClient({ fetcher })

    await expect(client.get('/api/fail')).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      message: 'bad request',
    })
  })
})
