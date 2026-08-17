import { describe, expect, it } from 'vitest'

import { gitActivityAlreadyInserted, gitActivityInsertLine } from './git-activity-text'

describe('git activity insert text', () => {
  it('keeps only the description from a conventional commit subject', () => {
    expect(gitActivityInsertLine('feat: 完成工时内容 Git 活动集成')).toBe('完成工时内容 Git 活动集成')
    expect(gitActivityInsertLine('fix(inventory): 期末库存改为期初加入库减出库')).toBe('期末库存改为期初加入库减出库')
    expect(gitActivityInsertLine('docs(api)!: 调整接口说明')).toBe('调整接口说明')
  })

  it('keeps subjects that are already plain descriptions', () => {
    expect(gitActivityInsertLine('期末库存改为期初加入库减出库')).toBe('期末库存改为期初加入库减出库')
    expect(gitActivityInsertLine('Merge branch develop')).toBe('Merge branch develop')
  })

  it('treats hash markers and identical description lines as already inserted', () => {
    expect(gitActivityAlreadyInserted('说明（abc1234）', {
      hash: 'abc1234',
      subject: 'feat: 说明',
    })).toBe(true)
    expect(gitActivityAlreadyInserted('已有正文\n期末库存改为期初加入库减出库', {
      hash: 'f162c59',
      subject: 'fix(inventory): 期末库存改为期初加入库减出库',
    })).toBe(true)
    expect(gitActivityAlreadyInserted('其他内容', {
      hash: 'f162c59',
      subject: 'fix(inventory): 期末库存改为期初加入库减出库',
    })).toBe(false)
  })
})
