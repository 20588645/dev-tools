import { describe, expect, it } from 'vitest'

import { parseTodoContent, serializeTodoContent, todoNotificationBody } from './todo-content'

describe('todo content compatibility', () => {
  it('parses the explicit checklist section without leaking its marker', () => {
    expect(parseTodoContent('说明文字\n[checklist]\n- [ ] 第一步\n- [x] 第二步')).toMatchObject({
      description: '说明文字',
      checklist: [
        { text: '第一步', done: false },
        { text: '第二步', done: true },
      ],
    })
  })

  it('parses checklist-only content produced by the legacy serializer', () => {
    expect(parseTodoContent('[checklist]\n- [ ] 第一步')).toMatchObject({
      description: '',
      checklist: [{ text: '第一步', done: false }],
    })
  })

  it('keeps compatibility with old mixed markdown checklist content', () => {
    expect(parseTodoContent('第一段\n- [ ] 待处理\n第二段\n- [X] 已处理')).toMatchObject({
      description: '第一段\n第二段',
      checklist: [
        { text: '待处理', done: false },
        { text: '已处理', done: true },
      ],
    })
  })

  it('serializes a stable legacy-compatible contract and drops empty rows', () => {
    expect(serializeTodoContent(' 说明 ', [
      { id: 'a', text: ' 第一步 ', done: false },
      { id: 'b', text: ' ', done: true },
    ])).toBe('说明\n[checklist]\n- [ ] 第一步')
  })

  it('keeps checklist syntax out of reminder notifications', () => {
    expect(todoNotificationBody('迁移待办', '[checklist]\n- [ ] 不应显示')).toBe('迁移待办')
  })
})
