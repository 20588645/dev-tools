import { describe, expect, it } from 'vitest'

import { hasConfirmableDirtyTabs, tabNeedsConfirm } from './editor-dirty'

describe('editor dirty helpers', () => {
  it('treats clean tabs as not needing confirm', () => {
    expect(tabNeedsConfirm({ dirty: false, isDraft: false, isContentEmpty: false })).toBe(false)
    expect(tabNeedsConfirm({ dirty: false, isDraft: true, isContentEmpty: true })).toBe(false)
  })

  it('requires confirm for dirty files', () => {
    expect(tabNeedsConfirm({ dirty: true, isDraft: false, isContentEmpty: false })).toBe(true)
  })

  it('ignores empty dirty drafts but confirms non-empty dirty drafts', () => {
    expect(tabNeedsConfirm({ dirty: true, isDraft: true, isContentEmpty: true })).toBe(false)
    expect(tabNeedsConfirm({ dirty: true, isDraft: true, isContentEmpty: false })).toBe(true)
  })

  it('detects any confirmable dirty tab for leave / batch close', () => {
    expect(hasConfirmableDirtyTabs([
      { dirty: true, isDraft: true, isContentEmpty: true },
      { dirty: false, isDraft: false, isContentEmpty: false },
    ])).toBe(false)

    expect(hasConfirmableDirtyTabs([
      { dirty: true, isDraft: true, isContentEmpty: true },
      { dirty: true, isDraft: false, isContentEmpty: false },
    ])).toBe(true)
  })
})
