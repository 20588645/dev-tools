import { describe, expect, it } from 'vitest'

import {
  formatHistoryStatus,
  formatHistoryTime,
  formatJobUrl,
  formatModules,
  formatUptime,
} from './run-format'

describe('formatUptime', () => {
  const base = 1_700_000_000_000

  it('缺少起始时间时显示「刚刚」而非 0s', () => {
    expect(formatUptime(0, base)).toBe('刚刚')
  })

  it('分档显示秒/分/时', () => {
    expect(formatUptime(base - 30_000, base)).toBe('30s')
    expect(formatUptime(base - 90_000, base)).toBe('1m')
    expect(formatUptime(base - 3_725_000, base)).toBe('1h 2m')
  })

  it('时钟回拨不产生负值', () => {
    expect(formatUptime(base + 5_000, base)).toBe('0s')
  })
})

describe('formatModules', () => {
  it('无模块视为整体项目', () => {
    expect(formatModules({ moduleNames: [], moduleName: '' })).toBe('整体项目')
  })

  it('回落到 moduleName', () => {
    expect(formatModules({ moduleNames: [], moduleName: 'home' })).toBe('home')
  })

  it('支持前缀', () => {
    expect(formatModules({ moduleNames: ['a', 'b'], moduleName: 'a' }, ' · ')).toBe(' · a, b')
  })
})

describe('formatJobUrl', () => {
  it('无任务显示未启动', () => {
    expect(formatJobUrl(null)).toBe('未启动')
  })

  it('优先用真实 url', () => {
    expect(formatJobUrl({ url: 'http://localhost:5173', port: 8080 })).toBe('http://localhost:5173')
  })

  it('仅有端口时用 localhost 拼接', () => {
    expect(formatJobUrl({ url: '', port: 8080 })).toBe('http://localhost:8080')
  })

  it('启动中尚无地址时给等待提示而非空白', () => {
    expect(formatJobUrl({ url: '', port: 0 })).toBe('等待地址')
  })
})

describe('formatHistoryStatus', () => {
  it('三档状态各自可达（依赖后端不再把 stopped 改写成 success）', () => {
    expect(formatHistoryStatus('success')).toEqual({ label: '已结束', tone: 'success' })
    expect(formatHistoryStatus('stopped')).toEqual({ label: '手动停止', tone: 'neutral' })
    expect(formatHistoryStatus('error')).toEqual({ label: '异常退出', tone: 'danger' })
  })

  it('未知状态按异常处理', () => {
    expect(formatHistoryStatus('weird').label).toBe('异常退出')
  })
})

describe('formatHistoryTime', () => {
  it('空值与非法值都显示破折号', () => {
    expect(formatHistoryTime('')).toBe('—')
    expect(formatHistoryTime('not-a-date')).toBe('—')
  })

  it('合法时间戳只到分钟', () => {
    const text = formatHistoryTime('2026-07-31T08:54:00.000Z')
    expect(text).not.toBe('—')
    expect(text).not.toMatch(/2026/)
  })
})
