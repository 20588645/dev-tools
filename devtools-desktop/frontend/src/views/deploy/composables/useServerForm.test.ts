import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import type { DeployServer } from '@/services/modules/deploy-service'
import { useDeployTaskStore } from '@/stores/deploy-task'

import { normalizeDeployPath, useServerForm } from './useServerForm'

const server: DeployServer = {
  id: 's1',
  name: '生产A',
  host: '10.0.0.21',
  port: 2222,
  username: 'deploy',
  authType: 'password',
  passwordMasked: '******',
  defaultRemotePath: '/var/www',
  deployPaths: ['/var/www/dist/'],
}

describe('normalizeDeployPath', () => {
  it('补齐首尾斜杠', () => {
    expect(normalizeDeployPath('data/release')).toBe('/data/release/')
    expect(normalizeDeployPath('/data/release')).toBe('/data/release/')
    expect(normalizeDeployPath('/data/release/')).toBe('/data/release/')
  })

  it('空白输入不产生路径', () => {
    expect(normalizeDeployPath('')).toBe('')
    expect(normalizeDeployPath('   ')).toBe('')
  })
})

describe('连接测试的任务归属', () => {
  /*
    回归：WS 消息的归属判据是 deploy-task store 的 active，
    连接测试若不先 begin() 就发请求，日志会被 acceptsMessage 全部拒收——
    表现为弹窗停在第一步、内容区空白，而连接其实是通的。
  */
  it('未登记任务时一律拒收消息', () => {
    setActivePinia(createPinia())
    const task = useDeployTaskStore()
    expect(task.acceptsMessage('test-1')).toBe(false)
  })

  it('登记后即便 id 未回填也先接受，随后按 id 匹配', () => {
    setActivePinia(createPinia())
    const task = useDeployTaskStore()
    task.begin('同仁堂测试')
    expect(task.acceptsMessage('test-1')).toBe(true)
    task.attachTaskId('test-1')
    expect(task.acceptsMessage('test-1')).toBe(true)
    expect(task.acceptsMessage('test-2')).toBe(false)
  })

  it('请求失败后本地解锁，不留死锁', () => {
    setActivePinia(createPinia())
    const task = useDeployTaskStore()
    task.begin('同仁堂测试')
    expect(task.isBusy('同仁堂测试')).toBe(true)
    task.abandon('同仁堂测试')
    expect(task.isBusy('同仁堂测试')).toBe(false)
    expect(task.acceptsMessage('test-1')).toBe(false)
  })
})

describe('useServerForm 编辑态', () => {
  it('掩码密码不回填，避免被当成真实密码提交', () => {
    const form = useServerForm()
    form.openEdit(server)
    expect(form.state.value.password).toBe('')
  })

  it('编辑态不改密码时提交体里没有 password', () => {
    const form = useServerForm()
    form.openEdit(server)
    const payload = form.buildPayload()
    expect('password' in payload).toBe(false)
    expect(payload.name).toBe('生产A')
    expect(payload.port).toBe(2222)
  })

  it('输入新密码才带上 password', () => {
    const form = useServerForm()
    form.openEdit(server)
    form.patchState({ password: 'new-secret' })
    expect(form.buildPayload().password).toBe('new-secret')
  })

  it('authType 固定为 password（认证方式无第二种实现）', () => {
    const form = useServerForm()
    form.openCreate()
    expect(form.buildPayload().authType).toBe('password')
  })

  it('新建态给出与旧实现一致的默认值', () => {
    const form = useServerForm()
    form.openCreate()
    const payload = form.buildPayload()
    expect(payload.port).toBe(22)
    expect(payload.username).toBe('root')
    expect(payload.defaultRemotePath).toBe('/')
    expect(payload.deployPaths).toEqual([])
  })

  it('端口非法时回落 22，不提交 NaN', () => {
    const form = useServerForm()
    form.openCreate()
    form.patchState({ port: '不是数字' })
    expect(form.buildPayload().port).toBe(22)
  })

  it('名称或 Host 为空时不允许保存', () => {
    const form = useServerForm()
    form.openCreate()
    expect(form.canSave.value).toBe(false)
    form.patchState({ name: '  ' , host: '10.0.0.1' })
    expect(form.canSave.value).toBe(false)
    form.patchState({ name: '生产B' })
    expect(form.canSave.value).toBe(true)
  })
})

describe('useServerForm 发布目录 tag', () => {
  it('添加时补斜杠并清空草稿', () => {
    const form = useServerForm()
    form.openCreate()
    form.pathDraft.value = 'data/release'
    form.addPath()
    expect(form.deployPaths.value).toEqual(['/data/release/'])
    expect(form.pathDraft.value).toBe('')
  })

  it('重复路径不追加，给出提示', () => {
    const form = useServerForm()
    form.openCreate()
    form.pathDraft.value = '/a/'
    form.addPath()
    form.pathDraft.value = 'a'
    form.addPath()
    expect(form.deployPaths.value).toEqual(['/a/'])
    expect(form.duplicateHint.value).toBe(true)
  })

  it('草稿为空时 Backspace 弹出最后一个，非空时不动', () => {
    const form = useServerForm()
    form.openCreate()
    form.deployPaths.value = ['/a/', '/b/']
    form.pathDraft.value = 'x'
    form.popPathOnBackspace()
    expect(form.deployPaths.value).toEqual(['/a/', '/b/'])
    form.pathDraft.value = ''
    form.popPathOnBackspace()
    expect(form.deployPaths.value).toEqual(['/a/'])
  })

  it('删除与就地编辑按下标生效', () => {
    const form = useServerForm()
    form.openCreate()
    form.deployPaths.value = ['/a/', '/b/', '/c/']
    form.removePath(1)
    expect(form.deployPaths.value).toEqual(['/a/', '/c/'])
    form.editPath(0, 'z')
    expect(form.deployPaths.value).toEqual(['/z/', '/c/'])
  })

  it('切到新建态清空上一次编辑的路径', () => {
    const form = useServerForm()
    form.openEdit(server)
    expect(form.deployPaths.value).toEqual(['/var/www/dist/'])
    form.openCreate()
    expect(form.deployPaths.value).toEqual([])
    expect(form.editingId.value).toBe('')
  })
})
