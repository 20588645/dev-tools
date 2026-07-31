import { defineStore } from 'pinia'

import {
  batchStopRun,
  getPortOwner,
  getRunStatuses,
  normalizeRunJob,
  restartRun,
  startRun,
  stopRun,
  type PortOwner,
  type RunJob,
  type StartRunInput,
} from '@/services/modules/run-service'

/**
 * 本地运行态的单一来源。
 *
 * 取代旧 `app.js` 的 `runningProjects` / `portOccupancyAlerts` 两个全局对象。
 * 首页卡片与系统托盘菜单同样消费这份状态，因此**不能**把它私有化到 RunView 内。
 *
 * 进程状态以 Sidecar 返回为权威（`reconcile` / `applyJob`），卡片本地状态只是投影。
 */

/** 只有这两种状态算「占着进程」，其余（stopping/stopped/error）不进 activeJobs。 */
const ACTIVE_STATUSES: RunJob['status'][] = ['starting', 'running']

export interface PortAlert {
  port: number | string
  pid: number
  pids: number[]
  user: string
  command: string
  commandPath: string
}

export const useRunStore = defineStore('run', {
  state: () => ({
    /** projectName → 活跃运行任务。 */
    activeJobs: {} as Record<string, RunJob>,
    /** projectName → 端口占用诊断。启动失败时填充，成功启动或状态转活跃时清除。 */
    portAlerts: {} as Record<string, PortAlert>,
    /** 上一次与 Sidecar 对账的时间，便于排查推送丢失。 */
    lastReconciledAt: 0,
    reconciling: false,
  }),

  /* 迁移期：托盘菜单与首页仍读旧全局 `runningProjects`（`app.js`），
     因此每次状态变更后把它同步一份过去。deploy 页迁移时一并收敛。 */

  getters: {
    runningProjectNames: (state) => Object.keys(state.activeJobs),
    runningCount: (state) => Object.keys(state.activeJobs).length,
    hasRunning: (state) => Object.keys(state.activeJobs).length > 0,
    jobOf: (state) => (projectName: string): RunJob | null => state.activeJobs[projectName] ?? null,
    alertOf: (state) => (projectName: string): PortAlert | null => state.portAlerts[projectName] ?? null,
  },

  actions: {
    /**
     * 把活跃任务同步到旧全局 `runningProjects`，并触发托盘菜单与首页刷新。
     *
     * 迁移期的桥：托盘菜单（`syncTrayMenu`）和首页卡片仍读旧全局。不同步会导致
     * 服务起停后托盘菜单不更新——那是真实回归，不是可以推后的细节。
     */
    syncLegacyGlobals() {
      const legacy = globalThis as {
        runningProjects?: Record<string, unknown>
        syncTrayMenu?: () => void
        requestHomeRefreshIfVisible?: (reason?: string) => void
      }
      if (legacy.runningProjects && typeof legacy.runningProjects === 'object') {
        for (const key of Object.keys(legacy.runningProjects)) delete legacy.runningProjects[key]
        Object.assign(legacy.runningProjects, this.activeJobs)
      }
      legacy.syncTrayMenu?.()
      legacy.requestHomeRefreshIfVisible?.('runtime-change')
    },

    /**
     * 与 Sidecar 全量对账，重建活跃任务表。
     *
     * WS 丢事件或瞬断时内存态可能失真，这是纠正手段；WS 重连与页面轮询都会调用。
     * 失败时**保留**现有状态而非清空——瞬时网络错误不该让运行中的服务从界面消失。
     */
    async reconcile(signal?: AbortSignal): Promise<boolean> {
      this.reconciling = true
      try {
        const jobs = await getRunStatuses(signal)
        const next: Record<string, RunJob> = {}
        for (const job of jobs) {
          if (ACTIVE_STATUSES.includes(job.status)) next[job.projectName] = job
        }
        this.activeJobs = next
        // 已经跑起来的项目不该再显示端口占用告警
        for (const name of Object.keys(this.portAlerts)) {
          if (next[name]) delete this.portAlerts[name]
        }
        this.lastReconciledAt = Date.now()
        this.syncLegacyGlobals()
        return true
      } catch {
        return false
      } finally {
        this.reconciling = false
      }
    },

    /**
     * 应用一条 WS `run-status` 推送。
     * 返回该任务是否仍活跃，供调用方决定后续动作（通知、端口诊断等）。
     */
    applyJob(payload: unknown): { job: RunJob; active: boolean } {
      const job = normalizeRunJob(payload)
      const active = ACTIVE_STATUSES.includes(job.status)
      if (active) {
        this.activeJobs[job.projectName] = job
        delete this.portAlerts[job.projectName]
      } else {
        delete this.activeJobs[job.projectName]
      }
      this.syncLegacyGlobals()
      return { job, active }
    },

    /** 启动请求返回后立刻登记，不等 WS——用户点完按钮就该看到「启动中」。 */
    trackJob(job: RunJob) {
      if (ACTIVE_STATUSES.includes(job.status)) {
        this.activeJobs[job.projectName] = job
        delete this.portAlerts[job.projectName]
        this.syncLegacyGlobals()
      }
    },

    /** 查询端口占用者并登记告警。返回占用信息，未占用则返回 null 并清除旧告警。 */
    async diagnosePort(projectName: string, port: number | string): Promise<PortAlert | null> {
      if (!port) return null
      try {
        const owner: PortOwner = await getPortOwner(port)
        if (!owner.inUse || !owner.pid) {
          delete this.portAlerts[projectName]
          return null
        }
        const alert: PortAlert = {
          port,
          pid: owner.pid,
          pids: owner.pids ?? [owner.pid],
          user: owner.user ?? '',
          command: owner.command ?? '',
          commandPath: owner.commandPath ?? '',
        }
        this.portAlerts[projectName] = alert
        return alert
      } catch {
        // 诊断失败不阻塞上层提示，也不残留可能过期的告警
        return null
      }
    },

    clearPortAlert(projectName: string) {
      delete this.portAlerts[projectName]
    },

    /* ── 以下为有真实副作用的动作，均只负责发起请求与登记状态 ── */

    async start(input: StartRunInput): Promise<RunJob> {
      const job = await startRun(input)
      this.trackJob(job)
      return job
    },

    async stop(jobId: string): Promise<RunJob> {
      return stopRun(jobId)
    },

    /**
     * 重启：接口立即返回（后台才停+重启），此时 status 已是 stopping。
     * 登记它可让「重启」按钮保持禁用，直到 WS 推回 running。
     */
    async restart(projectName: string, jobId: string): Promise<RunJob> {
      const job = await restartRun(jobId)
      // stopping 不属于 ACTIVE_STATUSES，trackJob 会忽略；这里显式覆盖以保留卡片
      this.activeJobs[projectName] = job
      this.syncLegacyGlobals()
      return job
    },

    async batchStop(projectNames: string[]): Promise<string[]> {
      return batchStopRun(projectNames)
    },
  },
})
