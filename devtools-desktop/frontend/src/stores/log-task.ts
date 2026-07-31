import { defineStore } from 'pinia'

import type { LogLine, LogProgressTone, LogStep } from '@/components/logviewer/LogViewer.vue'
import { resolveLogLineType, type LogLineType } from '@/components/logviewer/log-format'

/**
 * 日志任务状态：本地运行与部署面板共用一个 LogViewer 实例，由本 store 驱动。
 *
 * 取代旧 `app.js` 的 `activeTask` / `currentRunId` / `currentDeployId` 三个全局变量。
 * `kind` 保留旧 `taskKind` 的语义——最小化提示文案、是否显示等待计时都依赖它。
 */
export type LogTaskKind = 'run' | 'deploy'

export interface LogTaskMeta {
  kind: LogTaskKind
  /** Sidecar 侧任务 id；启动请求返回前可能为空。 */
  id: string | null
  projectName: string
  title: string
  subtitle: string
}

let lineSequence = 0

export const useLogTaskStore = defineStore('logTask', {
  state: () => ({
    visible: false,
    kind: 'run' as LogTaskKind,
    taskId: null as string | null,
    projectName: '',
    title: '',
    subtitle: '',
    lines: [] as LogLine[],
    steps: [] as LogStep[],
    percent: 0,
    indeterminate: false,
    progressLabel: '',
    progressTone: 'action' as LogProgressTone,
    resultIcon: '',
    resultText: '',
    resultNote: '',
    /** 任务是否仍在进行：决定关闭按钮是「关闭」还是「最小化」。 */
    running: false,
  }),

  actions: {
    /** 开一个新任务：清空日志与进度，接管弹窗。 */
    open(meta: LogTaskMeta, options: { steps?: string[]; running?: boolean } = {}) {
      this.kind = meta.kind
      this.taskId = meta.id
      this.projectName = meta.projectName
      this.title = meta.title
      this.subtitle = meta.subtitle
      this.lines = []
      this.steps = (options.steps ?? []).map((label, index) => ({
        label,
        state: index === 0 ? 'active' : 'pending',
      }))
      this.percent = 0
      this.indeterminate = false
      this.progressLabel = ''
      this.progressTone = 'action'
      this.resultIcon = ''
      this.resultText = ''
      this.resultNote = ''
      this.running = options.running ?? true
      this.visible = true
    },

    /** 任务 id 在启动请求返回后才确定，需要回填以便过滤后续 WS 日志。 */
    attachTaskId(id: string) {
      this.taskId = id
    },

    append(text: string, type: LogLineType = 'info') {
      lineSequence += 1
      this.lines.push({ id: lineSequence, text, type: resolveLogLineType(text, type) })
    },

    replaceLines(entries: Array<{ text: string; type?: LogLineType }>) {
      this.lines = entries.map((entry) => {
        lineSequence += 1
        return { id: lineSequence, text: entry.text, type: resolveLogLineType(entry.text, entry.type ?? 'info') }
      })
    },

    /** 只接受属于当前任务的日志，避免旧任务的滞后推送污染当前视图。 */
    appendIfCurrent(taskId: string, text: string, type: LogLineType = 'info') {
      if (this.taskId !== taskId) return
      this.append(text, type)
    },

    setProgress(patch: {
      percent?: number
      indeterminate?: boolean
      label?: string
      tone?: LogProgressTone
    }) {
      if (patch.percent !== undefined) this.percent = patch.percent
      if (patch.indeterminate !== undefined) this.indeterminate = patch.indeterminate
      if (patch.label !== undefined) this.progressLabel = patch.label
      if (patch.tone !== undefined) this.progressTone = patch.tone
    },

    setResult(patch: { icon?: string; text?: string; note?: string }) {
      if (patch.icon !== undefined) this.resultIcon = patch.icon
      if (patch.text !== undefined) this.resultText = patch.text
      if (patch.note !== undefined) this.resultNote = patch.note
    },

    /** 按索引推进步骤：之前的置 done，当前置 active，之后保持 pending。 */
    activateStep(index: number) {
      this.steps = this.steps.map((step, position) => ({
        ...step,
        state: position < index ? 'done' : position === index ? 'active' : 'pending',
      }))
    },

    finishAllSteps() {
      this.steps = this.steps.map((step) => ({ ...step, state: 'done' }))
    },

    setRunning(running: boolean) {
      this.running = running
    },

    /** 最小化：保留任务状态，只收起弹窗，后续可再打开。 */
    minimize() {
      this.visible = false
    },

    reopen() {
      if (this.taskId !== null || this.lines.length > 0) this.visible = true
    },

    /** 任务已结束且用户主动关闭：丢弃状态。 */
    close() {
      this.visible = false
      this.taskId = null
      this.running = false
      this.resultNote = ''
    },
  },
})
