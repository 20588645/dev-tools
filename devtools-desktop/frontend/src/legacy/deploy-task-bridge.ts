import { useDeployTaskStore } from '@/stores/deploy-task'

/**
 * 迁移期桥：让 legacy 的构建/部署发起流程登记到 `deploy-task` store。
 *
 * 为什么需要它：`deploy.js` 的 `startBuildOnly` / `startDeploy` 原先只维护 legacy
 * 的 `setBusy` + `activeTask` + `currentDeployId`，而项目总览子页的卡片忙态读的是
 * store（`task.isBusy`）。两边不通导致**从弹窗发起构建后卡片完全不显示忙态**，
 * 且 `acceptsMessage` 在 `active` 为 null 时拒收全部 WS 消息，连进度也进不了 store。
 * 那三个 legacy 全局已随本桥上线一并删除，store 现在是任务态的唯一来源。
 *
 * 桥必须随应用常驻（挂在 `MigrationHost`）而非某个子页：构建/部署是从**项目总览**
 * 的卡片发起的，弹窗却可能在任何页面上完成。
 *
 * 第 6 步弹窗迁入 Vue 后，发起流程直接调 store，本文件即可删除。
 */

export interface LegacyDeployTaskApi {
  /** 发起任务：占 busy 锁并建活跃任务（id 待 HTTP 返回后补写）。 */
  begin(projectName: string): void
  /** HTTP 返回后补写任务 id，关闭竞态窗口。 */
  attachTaskId(id: string): void
  /** 请求未发出时的本地解锁，避免卡片永久卡死。 */
  abandon(projectName: string): void
}

declare global {
  interface Window {
    __deployTask?: LegacyDeployTaskApi
  }
}

export function installDeployTaskBridge(): () => void {
  const store = useDeployTaskStore()

  const api: LegacyDeployTaskApi = {
    begin: projectName => store.begin(projectName),
    attachTaskId: id => store.attachTaskId(id),
    abandon: projectName => store.abandon(projectName),
  }

  window.__deployTask = api
  return () => {
    if (window.__deployTask === api) delete window.__deployTask
  }
}
