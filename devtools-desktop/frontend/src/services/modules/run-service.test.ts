import { describe, expect, it } from 'vitest'

import { normalizeRunJob } from './run-service'

describe('normalizeRunJob', () => {
  it('补齐缺失字段而不抛错', () => {
    const job = normalizeRunJob({})
    expect(job.id).toBe('')
    expect(job.moduleNames).toEqual([])
    expect(job.status).toBe('stopped')
    expect(job.compileStatus).toBe('')
    expect(job.autoRestartMax).toBe(3)
  })

  it('非法 status 归一到 stopped，避免未知态被当成运行中', () => {
    expect(normalizeRunJob({ status: 'weird' }).status).toBe('stopped')
    expect(normalizeRunJob({ status: 'running' }).status).toBe('running')
  })

  it('非法 compileStatus 归一到空串', () => {
    expect(normalizeRunJob({ compileStatus: 'bogus' }).compileStatus).toBe('')
    expect(normalizeRunJob({ compileStatus: 'error' }).compileStatus).toBe('error')
  })

  it('moduleName 缺失时回落到 moduleNames 首项', () => {
    expect(normalizeRunJob({ moduleNames: ['home', 'admin'] }).moduleName).toBe('home')
  })

  it('pid / stoppedAt / exitCode 用 null 而非 0 表达缺失', () => {
    const job = normalizeRunJob({ pid: null, stoppedAt: null, exitCode: null })
    expect(job.pid).toBeNull()
    expect(job.stoppedAt).toBeNull()
    expect(job.exitCode).toBeNull()
  })

  it('exitCode 为 0 时保留 0，不能被当成缺失', () => {
    // 退出码 0 表示正常退出，误判为 null 会让「自然结束」与「未结束」混淆
    expect(normalizeRunJob({ exitCode: 0 }).exitCode).toBe(0)
  })

  it('过滤 moduleNames 中的空值', () => {
    expect(normalizeRunJob({ moduleNames: ['home', '', null, 'admin'] }).moduleNames).toEqual(['home', 'admin'])
  })

  it('port 保留数字或字符串两种形态', () => {
    expect(normalizeRunJob({ port: 8080 }).port).toBe(8080)
    expect(normalizeRunJob({ port: '8080' }).port).toBe('8080')
  })
})
