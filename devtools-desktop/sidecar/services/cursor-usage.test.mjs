// @vitest-environment node
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  dateWindow,
  eventsFromPayload,
  fetchOfficialEvents,
  parseEvent,
  parseTimestamp,
  userIdFromJwt,
} = require('./cursor-usage')

function sampleEvent(id, timestamp = '1785300000000') {
  return {
    id,
    timestamp,
    model: 'composer-2',
    kind: 'USAGE_EVENT_KIND_INCLUDED_IN_BUSINESS',
    tokenUsage: {
      inputTokens: 3,
      outputTokens: 20,
      cacheWriteTokens: 100,
      totalCents: 1.2,
    },
    chargedCents: 1.2,
  }
}

function jwtWithSub(sub) {
  const payload = Buffer.from(JSON.stringify({ sub }), 'utf8').toString('base64url')
  return `header.${payload}.sig`
}

describe('cursor usage parser', () => {
  it('reads the Cursor account id from a JWT payload', () => {
    expect(userIdFromJwt(jwtWithSub('user_abc'))).toBe('user_abc')
    expect(userIdFromJwt('not-a-jwt')).toBe('')
  })

  it('parses official usage events into the same fields as Claude / Codex logs', () => {
    const event = parseEvent({
      timestamp: 1_785_300_000_000,
      model: 'cursor-grok-4.6',
      kind: 'composer',
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 8000,
        cacheWriteTokens: 50,
      },
      chargedCents: 0,
    })
    expect(event).toMatchObject({
      appType: 'cursor',
      model: 'cursor-grok-4.6',
      sessionId: 'composer',
      projectDir: '官方账号',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 50,
      createdAt: 1_785_300_000,
    })
    expect(event.requestId.startsWith('cursor:')).toBe(true)
  })

  it('parses official millisecond timestamps sent as strings', () => {
    expect(parseTimestamp('1785300000000')).toBe(1_785_300_000_000)
    expect(parseTimestamp('1785300000')).toBe(1_785_300_000_000)
    const event = parseEvent(sampleEvent('evt-ms'))
    expect(event.createdAt).toBe(1_785_300_000)
    expect(event.cacheCreationTokens).toBe(100)
    expect(event.requestId).toBe('cursor:evt-ms')
  })

  it('skips empty events and keeps a stable id when the payload has one', () => {
    expect(parseEvent({ timestamp: 1_785_300_000_000, tokenUsage: {} })).toBeNull()
    expect(parseEvent({
      id: 'evt-1',
      timestamp: '2026-08-18T05:43:00.000Z',
      model: 'claude-opus-5',
      tokenUsage: { input_tokens: 10, output_tokens: 2 },
    }).requestId).toBe('cursor:evt-1')
  })

  it('reads both usageEventsDisplay and usageEvents arrays', () => {
    const payload = {
      usageEventsDisplay: [{
        timestamp: 1_785_300_000_000,
        model: 'cursor-grok-4.6',
        tokenUsage: { inputTokens: 1, outputTokens: 1 },
      }],
    }
    expect(eventsFromPayload(payload)).toHaveLength(1)
    expect(eventsFromPayload({ usageEvents: payload.usageEventsDisplay })).toHaveLength(1)
    expect(eventsFromPayload({})).toEqual([])
  })

  it('windows the last 30 local days ending now', () => {
    const now = new Date(2026, 7, 18, 14, 0, 0)
    const window = dateWindow(now, 30)
    expect(window.end).toBe(now.getTime())
    expect(window.start).toBe(new Date(2026, 6, 20).getTime())
  })

  it('paginates official events until the reported total', async () => {
    const pages = [
      { totalUsageEventsCount: 2, usageEventsDisplay: [sampleEvent('a')] },
      { totalUsageEventsCount: 2, usageEventsDisplay: [sampleEvent('b')] },
    ]
    let calls = 0
    const events = await fetchOfficialEvents({
      auth: { accessToken: 'token', userId: 'user_1', dashboardUserId: 0 },
      window: { start: 1, end: 2 },
      fetch: async () => {
        const payload = pages[calls]
        calls += 1
        return { ok: true, status: 200, json: async () => payload }
      },
    })
    expect(events.map((event) => event.requestId)).toEqual(['cursor:a', 'cursor:b'])
    expect(calls).toBe(2)
  })

  it('fails closed when a page has events that cannot be parsed', async () => {
    await expect(fetchOfficialEvents({
      auth: { accessToken: 'token', userId: 'user_1', dashboardUserId: 0 },
      window: { start: 1, end: 2 },
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          totalUsageEventsCount: 12,
          usageEventsDisplay: [{ model: 'composer-2', tokenUsage: { inputTokens: 1 } }],
        }),
      }),
    })).rejects.toThrow('Cursor 用量事件无法解析')
  })
})
