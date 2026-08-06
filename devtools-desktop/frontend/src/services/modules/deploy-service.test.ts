import { describe, expect, it } from 'vitest'

import {
  buildServerPayload,
  isMaskedPassword,
  normalizeHistoryItem,
  normalizeServer,
  type ServerInput,
} from './deploy-service'

const baseInput: ServerInput = {
  name: '同仁堂生产',
  host: '192.168.1.15',
  port: 22,
  username: 'root',
  authType: 'password',
  defaultRemotePath: '/docker/nginx/www',
  deployPaths: [],
}

describe('服务器凭据掩码契约', () => {
  it('识别后端返回的掩码值', () => {
    expect(isMaskedPassword('******')).toBe(true)
    expect(isMaskedPassword('*')).toBe(true)
    expect(isMaskedPassword('')).toBe(false)
    expect(isMaskedPassword('real-secret')).toBe(false)
    // 含星号但不全是星号的真实密码不能被误判
    expect(isMaskedPassword('pa**word')).toBe(false)
  })

  it('掩码值不进提交体，避免把字面量 ****** 写成真实密码', () => {
    const payload = buildServerPayload(baseInput, '******')
    expect('password' in payload).toBe(false)
  })

  it('空密码同样不进提交体，表示不修改', () => {
    const payload = buildServerPayload(baseInput, '')
    expect('password' in payload).toBe(false)
  })

  it('用户真实输入的新密码才提交', () => {
    const payload = buildServerPayload(baseInput, 'new-secret')
    expect(payload.password).toBe('new-secret')
  })

  it('不会把传入对象上残留的 password 泄漏出去', () => {
    const dirty = { ...baseInput, password: '不该被带出去' } as ServerInput
    const payload = buildServerPayload(dirty, '******')
    expect('password' in payload).toBe(false)
  })
})

describe('normalizeServer', () => {
  it('缺字段时给出安全默认值', () => {
    const server = normalizeServer({})
    expect(server.port).toBe(22)
    expect(server.username).toBe('root')
    expect(server.authType).toBe('password')
    expect(server.defaultRemotePath).toBe('/')
    expect(server.deployPaths).toEqual([])
  })

  it('保留掩码密码但不当作真实值', () => {
    const server = normalizeServer({ id: 's1', password: '******' })
    expect(server.passwordMasked).toBe('******')
    expect(isMaskedPassword(server.passwordMasked)).toBe(true)
  })

  it('未知 authType 回落到 password', () => {
    expect(normalizeServer({ authType: 'weird' }).authType).toBe('password')
    expect(normalizeServer({ authType: 'privateKey' }).authType).toBe('privateKey')
  })
})

describe('normalizeHistoryItem', () => {
  it('modules 为空或缺失都归一成数组', () => {
    expect(normalizeHistoryItem({}).modules).toEqual([])
    expect(normalizeHistoryItem({ modules: ['a', 'b'] }).modules).toEqual(['a', 'b'])
  })

  it('只有 success 算成功，其余一律按失败处理', () => {
    expect(normalizeHistoryItem({ status: 'success' }).status).toBe('success')
    expect(normalizeHistoryItem({ status: 'error' }).status).toBe('error')
    expect(normalizeHistoryItem({}).status).toBe('error')
  })

  it('类型只区分 deploy 与 build-only', () => {
    expect(normalizeHistoryItem({ type: 'deploy' }).type).toBe('deploy')
    expect(normalizeHistoryItem({ type: 'build-only' }).type).toBe('build-only')
    expect(normalizeHistoryItem({ type: '' }).type).toBe('build-only')
  })
})
