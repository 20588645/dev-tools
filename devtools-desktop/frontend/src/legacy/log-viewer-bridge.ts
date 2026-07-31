import type { LogLineType } from '@/components/logviewer/log-format'
import { useLogTaskStore, type LogTaskKind } from '@/stores/log-task'

/**
 * 旧 `src/js/*.js` → Vue LogViewer 的过渡桥。
 *
 * 部署面板（Phase 6-2）尚未迁移，仍以命令式方式驱动日志弹窗。这里把旧代码需要的
 * 几个动作挂到 `window.__logViewer`，由旧脚本调用，从而让新旧两边共用同一个
 * LogViewer 实例——避免出现两份日志实现。
 *
 * 本模块随 `deploy` 页迁移完成后即可删除。
 */
export interface LegacyLogViewerApi {
  open(meta: {
    kind: LogTaskKind
    id?: string | null
    projectName?: string
    title: string
    subtitle?: string
    steps?: string[]
    running?: boolean
  }): void
  attachTaskId(id: string): void
  append(text: string, type?: LogLineType): void
  replaceLines(entries: Array<{ text: string; type?: LogLineType }>): void
  setProgress(patch: { percent?: number; indeterminate?: boolean; label?: string; tone?: 'action' | 'success' | 'warning' | 'danger' }): void
  setResult(patch: { icon?: string; text?: string; note?: string }): void
  activateStep(index: number): void
  finishAllSteps(): void
  setRunning(running: boolean): void
  /** 收起弹窗但保留任务状态，供旧代码主动最小化。 */
  minimize(): void
  reopen(): void
  close(): void
  /** 旧代码判断当前弹窗归属，替代直接读 `activeTask`。 */
  currentTaskId(): string | null
  isVisible(): boolean
}

declare global {
  interface Window {
    __logViewer?: LegacyLogViewerApi
  }
}

export function installLogViewerBridge(): () => void {
  const store = useLogTaskStore()

  const api: LegacyLogViewerApi = {
    open: (meta) => store.open(
      {
        kind: meta.kind,
        id: meta.id ?? null,
        projectName: meta.projectName ?? '',
        title: meta.title,
        subtitle: meta.subtitle ?? '',
      },
      { steps: meta.steps, running: meta.running },
    ),
    attachTaskId: (id) => store.attachTaskId(id),
    append: (text, type) => store.append(text, type),
    replaceLines: (entries) => store.replaceLines(entries),
    setProgress: (patch) => store.setProgress(patch),
    setResult: (patch) => store.setResult(patch),
    activateStep: (index) => store.activateStep(index),
    finishAllSteps: () => store.finishAllSteps(),
    setRunning: (running) => store.setRunning(running),
    minimize: () => store.minimize(),
    reopen: () => store.reopen(),
    close: () => store.close(),
    currentTaskId: () => store.taskId,
    isVisible: () => store.visible,
  }

  window.__logViewer = api
  return () => {
    if (window.__logViewer === api) delete window.__logViewer
  }
}
