import { describe, expect, it } from 'vitest'

import {
  buildServerPayload,
  isMaskedPassword,
  normalizeFileZillaSource,
  normalizeHistoryItem,
  normalizeHistoryLog,
  normalizeTimestamp,
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

describe('normalizeFileZillaSource', () => {
  // 后端 GET /api/servers/filezilla 与 POST /filezilla/parse 都回 { path, servers }，
  // 不是裸数组；曾按数组解析导致列表恒为空。
  it('从 { path, servers } 包裹结构取值', () => {
    const source = normalizeFileZillaSource({
      path: '/Users/x/.config/filezilla/sitemanager.xml',
      servers: [{ name: '生产A', host: '10.0.0.1', port: 2222, username: 'deploy', exists: true }],
    })
    expect(source.path).toBe('/Users/x/.config/filezilla/sitemanager.xml')
    expect(source.servers).toHaveLength(1)
    expect(source.servers[0]).toEqual({
      name: '生产A', host: '10.0.0.1', port: 2222, username: 'deploy', exists: true,
    })
  })

  it('裸数组或空响应不抛错，回空列表', () => {
    expect(normalizeFileZillaSource([]).servers).toEqual([])
    expect(normalizeFileZillaSource(undefined).servers).toEqual([])
    expect(normalizeFileZillaSource({ servers: '不是数组' }).servers).toEqual([])
    expect(normalizeFileZillaSource(undefined).path).toBe('')
  })

  it('exists 只认布尔真，缺失按未导入处理', () => {
    const { servers } = normalizeFileZillaSource({
      servers: [{ name: 'a' }, { name: 'b', exists: false }, { name: 'c', exists: 'true' }],
    })
    expect(servers.map(s => s.exists)).toEqual([false, false, false])
  })

  it('缺 port 回落 22', () => {
    const { servers } = normalizeFileZillaSource({ servers: [{ name: 'a' }] })
    expect(servers[0].port).toBe(22)
  })
})

describe('normalizeHistoryLog', () => {
  // 后端 GET /api/history/:id 把日志放在 logs 字段；曾误读 lines / log，
  // 两个字段都不存在，导致「查看日志」恒为空。
  it('从 logs 字段取日志行', () => {
    const lines = normalizeHistoryLog({
      id: 'h1',
      logs: [
        { time: 1786096800000, type: 'info', text: '开始部署' },
        { time: 1786096801000, type: 'success', text: '完成' },
      ],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ time: 1786096800000, type: 'info', text: '开始部署' })
  })

  it('旧字段名不再被误认（lines / log 都不是契约字段）', () => {
    expect(normalizeHistoryLog({ lines: [{ text: 'x' }] })).toEqual([])
    expect(normalizeHistoryLog({ log: [{ text: 'x' }] })).toEqual([])
  })

  it('缺字段或非数组时回空，不抛错', () => {
    expect(normalizeHistoryLog({})).toEqual([])
    expect(normalizeHistoryLog(undefined)).toEqual([])
    expect(normalizeHistoryLog({ logs: '不是数组' })).toEqual([])
  })

  it('缺 type 回落 info，缺 time 回落 0', () => {
    const [line] = normalizeHistoryLog({ logs: [{ text: '裸行' }] })
    expect(line).toEqual({ time: 0, type: 'info', text: '裸行' })
  })
})

describe('normalizeTimestamp', () => {
  // 后端历史与 last-deploy 的 timestamp 是 ISO 字符串，曾用 num() 解析
  // 直接落 0，导致时间列恒显示「—」。
  it('解析 ISO 字符串', () => {
    expect(normalizeTimestamp('2026-06-28T16:42:00.000Z')).toBe(Date.parse('2026-06-28T16:42:00.000Z'))
  })

  it('数字原样通过', () => {
    expect(normalizeTimestamp(1786096800000)).toBe(1786096800000)
  })

  it('非法值回落 0，交由格式化层显示占位', () => {
    expect(normalizeTimestamp(undefined)).toBe(0)
    expect(normalizeTimestamp('')).toBe(0)
    expect(normalizeTimestamp('不是时间')).toBe(0)
    expect(normalizeTimestamp(Number.NaN)).toBe(0)
  })
})

describe('normalizeHistoryItem 的时间戳', () => {
  it('ISO 字符串能解析出可格式化的毫秒数', () => {
    const item = normalizeHistoryItem({ id: 'h', timestamp: '2026-06-28T16:42:00.000Z' })
    expect(item.timestamp).toBeGreaterThan(0)
    expect(new Date(item.timestamp).getUTCFullYear()).toBe(2026)
  })
})
