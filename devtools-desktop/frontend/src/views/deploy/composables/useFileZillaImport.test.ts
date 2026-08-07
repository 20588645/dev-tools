import { describe, expect, it } from 'vitest'

import type { FileZillaServer } from '@/services/modules/deploy-service'

import { useFileZillaImport } from './useFileZillaImport'

const entry = (name: string, exists: boolean): FileZillaServer => ({
  name, exists, host: `host-${name}`, port: 22, username: 'root',
})

/** 直接摆好列表与勾选态，绕开网络，只验三态与摘要这两处易错逻辑。 */
function withItems(items: FileZillaServer[], checkedNames: string[]) {
  const importer = useFileZillaImport()
  importer.items.value = items
  importer.checked.value = new Set(checkedNames)
  return importer
}

describe('FileZilla 导入三态', () => {
  it('已存在且勾选=已导入，已存在未勾选=将删除', () => {
    const importer = withItems([entry('a', true), entry('b', true)], ['a'])
    expect(importer.stateOf(entry('a', true))).toBe('imported')
    expect(importer.stateOf(entry('b', true))).toBe('will-remove')
  })

  it('不存在且勾选=待导入，不存在未勾选=无标记', () => {
    const importer = withItems([entry('c', false), entry('d', false)], ['c'])
    expect(importer.stateOf(entry('c', false))).toBe('pending')
    expect(importer.stateOf(entry('d', false))).toBe('none')
  })
})

describe('FileZilla 导入摘要', () => {
  it('分别统计新增与删除', () => {
    const importer = withItems(
      [entry('keep', true), entry('drop', true), entry('add', false)],
      ['keep', 'add'],
    )
    expect(importer.summary.value).toBe('新增 1，删除 1')
  })

  it('没有变更时回落到已选计数', () => {
    const importer = withItems([entry('keep', true)], ['keep'])
    expect(importer.summary.value).toBe('已选 1 个')
  })
})

describe('FileZilla 勾选操作', () => {
  it('toggle 往返切换', () => {
    const importer = withItems([entry('a', false)], [])
    importer.toggle('a')
    expect(importer.checked.value.has('a')).toBe(true)
    importer.toggle('a')
    expect(importer.checked.value.has('a')).toBe(false)
  })

  it('全选与全不选覆盖整张列表', () => {
    const importer = withItems([entry('a', true), entry('b', false)], [])
    importer.toggleAll(true)
    expect(importer.checked.value.size).toBe(2)
    importer.toggleAll(false)
    expect(importer.checked.value.size).toBe(0)
  })
})
