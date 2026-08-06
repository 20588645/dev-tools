import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDeployTaskStore } from './deploy-task'

/**
 * 这两组用例守的是 assessment 4.2 记录的两个隐性契约。
 * 它们在旧实现里只有注释保护，迁移时最容易丢，故单独覆盖。
 */
describe('useDeployTaskStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('WS 与 HTTP 竞态', () => {
    it('尚未拿到任务 id 时接受推送，并就地补写 id', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')

      // 竞态窗口：HTTP 还没返回，id 仍为 null
      expect(store.taskId).toBeNull()
      expect(store.hasActiveTask).toBe(true)
      // 此时无法比对 id，必须先认下推送，否则会丢掉最早的几条日志与进度
      expect(store.acceptsMessage('deploy-1')).toBe(true)

      expect(store.adoptTaskId('deploy-1')).toBe(true)
      expect(store.taskId).toBe('deploy-1')
    })

    it('已有任务 id 后只接受同 id 的推送', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')
      store.attachTaskId('deploy-1')

      expect(store.acceptsMessage('deploy-1')).toBe(true)
      expect(store.acceptsMessage('deploy-2')).toBe(false)
      expect(store.acceptsMessage(null)).toBe(false)
    })

    it('已有任务 id 后不再认领别的 id，避免串台', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')
      store.attachTaskId('deploy-1')

      expect(store.adoptTaskId('deploy-2')).toBe(false)
      expect(store.taskId).toBe('deploy-1')
    })

    it('没有活跃任务时一律不接受推送', () => {
      const store = useDeployTaskStore()

      expect(store.acceptsMessage('deploy-1')).toBe(false)
      expect(store.adoptTaskId('deploy-1')).toBe(false)
    })
  })

  describe('busy 锁与失败解锁', () => {
    it('发起任务即占锁，卡片据此禁用操作', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')

      expect(store.isBusy('moutai-frontend')).toBe(true)
      expect(store.isBusy('ldts-twin')).toBe(false)
      expect(store.isRunning).toBe(true)
    })

    it('请求未发出时本地解锁，否则卡片会永久卡死', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')

      // 后端没收到请求，不会回 WS 完成事件
      store.abandon('moutai-frontend')

      expect(store.isBusy('moutai-frontend')).toBe(false)
      expect(store.hasActiveTask).toBe(false)
    })

    it('任务完成后解锁但保留任务态，供 LogViewer 显示结果', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')
      store.attachTaskId('deploy-1')

      store.finish('moutai-frontend')

      expect(store.isBusy('moutai-frontend')).toBe(false)
      expect(store.isRunning).toBe(false)
      // 仍保留，否则结果面板会失去归属信息
      expect(store.hasActiveTask).toBe(true)
      expect(store.taskId).toBe('deploy-1')
    })

    it('finish 不传项目名时按活跃任务解锁', () => {
      const store = useDeployTaskStore()
      store.begin('moutai-frontend')

      store.finish()

      expect(store.isBusy('moutai-frontend')).toBe(false)
    })

    it('重复占锁不会产生重复条目', () => {
      const store = useDeployTaskStore()
      store.setBusy('moutai-frontend')
      store.setBusy('moutai-frontend')

      expect(store.busyProjects).toEqual(['moutai-frontend'])
    })

    it('多个项目可各自占锁，互不影响', () => {
      const store = useDeployTaskStore()
      store.setBusy('a')
      store.setBusy('b')
      store.clearBusy('a')

      expect(store.isBusy('a')).toBe(false)
      expect(store.isBusy('b')).toBe(true)
    })
  })
})
