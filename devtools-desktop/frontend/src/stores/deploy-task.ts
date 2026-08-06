import { defineStore } from 'pinia'

/**
 * 构建 / 部署任务态的单一来源。
 *
 * 取代旧 `app.js` 的 `activeTask`、`currentDeployId`、`busyProjects` 三个全局。
 * 这三者原先散在 `app.js`（状态与 WS 处理）和 `deploy.js`（发起与渲染）两侧，
 * 是本页最容易出真实故障的部分，因此先于页面迁移单独建模。
 *
 * 两个隐性契约必须显式保留（见 assessment 4.2）：
 *
 * 1. **WS 与 HTTP 竞态**：`POST /api/deploy/build|start` 返回任务 id 之前，
 *    WS 就可能推来该任务的 log/progress/status。旧实现用
 *    `!(activeTask && !currentDeployId)` 兜住——「有活跃任务但还没拿到 id」
 *    时接受消息并就地补写 id。这里由 `adoptTaskId` 与 `acceptsMessage` 表达。
 * 2. **失败必须本地解锁**：请求未发出时后端不会回 WS 完成事件，
 *    必须本地 `clearBusy`，否则卡片永久卡在「⏳ 查看进度」直到重启软件。
 */

export type DeployTaskType = 'build-only' | 'deploy'

export interface DeployTask {
  /** 后端任务 id。发起后到 HTTP 返回前为 null，此时仍算活跃任务。 */
  id: string | null
  projectName: string
  running: boolean
}

/** 任务阶段。`test-` 前缀的连接测试只用 preflight/done 两档。 */
export type DeployPhase = 'preflight' | 'pulling' | 'building' | 'uploading' | 'done'

export const useDeployTaskStore = defineStore('deploy-task', {
  state: () => ({
    /** 当前活跃任务；同一时刻只允许一个（与旧实现一致）。 */
    active: null as DeployTask | null,
    /**
     * 正在构建/部署的项目名。卡片据此显示「⏳ 查看进度」并禁用操作按钮。
     * 用数组而非 Set：Pinia 的 state 需要可序列化，且这里规模极小。
     */
    busyProjects: [] as string[],
  }),

  getters: {
    /** 当前任务 id；未发起或尚未拿到 id 时为 null。 */
    taskId: (state): string | null => state.active?.id ?? null,
    hasActiveTask: (state): boolean => state.active !== null,
    isRunning: (state): boolean => state.active?.running === true,
    isBusy: (state) => (projectName: string): boolean => state.busyProjects.includes(projectName),

    /**
     * 该 WS 消息是否属于当前任务。
     *
     * 两种情况接受：id 完全匹配，或「有活跃任务但还没拿到 id」——后者正是
     * 竞态窗口，此时无法比对 id，只能先认下再由 `adoptTaskId` 补写。
     */
    acceptsMessage: (state) => (messageId: string | null | undefined): boolean => {
      if (!state.active) return false
      if (state.active.id === null) return true
      return Boolean(messageId) && messageId === state.active.id
    },
  },

  actions: {
    /**
     * 发起任务。在 HTTP 请求之前调用，因此 id 必然为 null。
     *
     * 顺序与旧实现一致：先占 busy 锁再发请求，避免请求往返期间用户连点。
     */
    begin(projectName: string) {
      this.setBusy(projectName)
      this.active = { id: null, projectName, running: true }
    },

    /** HTTP 返回后补写任务 id。竞态窗口在此关闭。 */
    attachTaskId(id: string) {
      if (this.active) this.active.id = id
    },

    /**
     * 竞态兜底：WS 消息先到时用消息里的 id 补写。
     *
     * 只在「有活跃任务且尚无 id」时生效，避免把另一个任务的 id 认领过来。
     */
    adoptTaskId(id: string | null | undefined): boolean {
      if (!id || !this.active || this.active.id !== null) return false
      this.active.id = id
      return true
    },

    /** 任务结束（成功或失败）。保留 active 以便 LogViewer 仍能显示结果。 */
    finish(projectName?: string) {
      if (this.active) this.active.running = false
      if (projectName) this.clearBusy(projectName)
      else if (this.active) this.clearBusy(this.active.projectName)
    },

    /**
     * 请求未发出时的本地解锁。
     *
     * 后端没收到请求就不会回 WS 完成事件，不在这里解锁会让卡片永久卡死。
     * 与 `finish` 分开命名是为了让调用点的意图可读。
     */
    abandon(projectName: string) {
      this.clearBusy(projectName)
      this.active = null
    },

    /** 清空活跃任务。关闭 LogViewer 或切换任务前调用。 */
    reset() {
      this.active = null
    },

    setBusy(projectName: string) {
      if (!this.busyProjects.includes(projectName)) this.busyProjects.push(projectName)
    },

    clearBusy(projectName: string) {
      const index = this.busyProjects.indexOf(projectName)
      if (index !== -1) this.busyProjects.splice(index, 1)
    },
  },
})
