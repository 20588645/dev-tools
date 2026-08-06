import { describe, expect, it } from 'vitest'

import { inferRunCommand, normalizeProject, projectDefaultServerIds } from './project-service'

describe('projectDefaultServerIds', () => {
  it('数组字段优先', () => {
    expect(projectDefaultServerIds({ defaultServerIds: ['s1', 's2'], defaultServerId: 's9' }))
      .toEqual(['s1', 's2'])
  })

  it('数组为空时回落到早期版本的单值字段', () => {
    expect(projectDefaultServerIds({ defaultServerIds: [], defaultServerId: 's9' })).toEqual(['s9'])
  })

  it('两者都空时返回空数组，卡片据此显示「未配置服务器」', () => {
    expect(projectDefaultServerIds({ defaultServerIds: [], defaultServerId: '' })).toEqual([])
  })
})

describe('normalizeProject', () => {
  it('补齐部署字段，缺失时不产生 undefined', () => {
    const project = normalizeProject({ name: 'p' })
    expect(project.defaultServerIds).toEqual([])
    expect(project.defaultServerId).toBe('')
  })

  it('displayName 缺失时回落到 name', () => {
    expect(normalizeProject({ name: 'moutai-frontend' }).displayName).toBe('moutai-frontend')
  })

  it('runIncludeHome 缺省视为 true', () => {
    expect(normalizeProject({ name: 'p' }).runIncludeHome).toBe(true)
    expect(normalizeProject({ name: 'p', runIncludeHome: false }).runIncludeHome).toBe(false)
  })

  it('过滤无名模块', () => {
    const project = normalizeProject({ name: 'p', modules: [{ name: 'a' }, {}, { name: '' }] })
    expect(project.modules.map(m => m.name)).toEqual(['a'])
  })
})

describe('inferRunCommand', () => {
  it('显式命令优先', () => {
    expect(inferRunCommand({ runCommand: 'npm run custom', tool: 'Vue CLI' })).toBe('npm run custom')
  })

  it('Vue CLI 用 serve，其余用 dev', () => {
    expect(inferRunCommand({ runCommand: '', tool: 'Vue CLI' })).toBe('npm run serve')
    expect(inferRunCommand({ runCommand: '', tool: 'Webpack' })).toBe('npm run dev')
  })
})
