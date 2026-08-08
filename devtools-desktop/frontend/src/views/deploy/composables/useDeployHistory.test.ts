import { describe, expect, it } from 'vitest'

import type { HistoryItem } from '@/services/modules/deploy-service'

import { useDeployHistory } from './useDeployHistory'

const item = (over: Partial<HistoryItem> & { id: string }): HistoryItem => ({
  projectName: 'p',
  type: 'deploy',
  status: 'success',
  modules: [],
  serverName: 's',
  nodeVersion: '18',
  remotePath: '/x',
  duration: '1s',
  timestamp: 0,
  ...over,
})

function withItems(rows: HistoryItem[]) {
  const page = useDeployHistory()
  page.items.value = rows
  return page
}

const SAMPLE = [
  item({ id: 'a', type: 'deploy', status: 'success' }),
  item({ id: 'b', type: 'build-only', status: 'success' }),
  item({ id: 'c', type: 'deploy', status: 'error' }),
]

describe('筛选', () => {
  it('默认不筛选', () => {
    expect(withItems(SAMPLE).filtered.value.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('按类型筛选', () => {
    const page = withItems(SAMPLE)
    page.typeFilter.value = 'build-only'
    expect(page.filtered.value.map(i => i.id)).toEqual(['b'])
  })

  /*
    关键回归：后端写 status: 'fail'，但 normalizeHistoryItem 折叠成内部值
    'error'。筛选必须按 'error' 比对——照搬 legacy 的 'fail' 会让失败筛选恒空。
  */
  it('失败筛选按内部值 error 比对', () => {
    const page = withItems(SAMPLE)
    page.statusFilter.value = 'error'
    expect(page.filtered.value.map(i => i.id)).toEqual(['c'])
  })

  it('类型与状态可叠加，无匹配时为空', () => {
    const page = withItems(SAMPLE)
    page.typeFilter.value = 'build-only'
    page.statusFilter.value = 'error'
    expect(page.filtered.value).toEqual([])
  })
})

describe('统计条', () => {
  it('统计总数与成功失败数', () => {
    const { stats } = withItems(SAMPLE)
    expect(stats.value.total).toBe(3)
    expect(stats.value.success).toBe(2)
    expect(stats.value.failed).toBe(1)
  })

  it('未筛选时不给 filteredCount，筛选后才给', () => {
    const page = withItems(SAMPLE)
    expect(page.stats.value.filteredCount).toBeNull()
    page.statusFilter.value = 'error'
    expect(page.stats.value.filteredCount).toBe(1)
  })

  it('统计始终基于全量而非筛选结果', () => {
    const page = withItems(SAMPLE)
    page.statusFilter.value = 'error'
    expect(page.stats.value.total).toBe(3)
    expect(page.stats.value.success).toBe(2)
  })
})

describe('批量选择', () => {
  it('切换模式会清空已选', () => {
    const page = withItems(SAMPLE)
    page.toggleBatchMode()
    page.toggleSelect('a')
    expect(page.selectedCount.value).toBe(1)
    page.toggleBatchMode()
    expect(page.selectedCount.value).toBe(0)
    expect(page.batchMode.value).toBe(false)
  })

  it('toggleSelect 往返切换', () => {
    const page = withItems(SAMPLE)
    page.toggleSelect('a')
    expect(page.selectedIds.value.has('a')).toBe(true)
    page.toggleSelect('a')
    expect(page.selectedIds.value.has('a')).toBe(false)
  })
})
