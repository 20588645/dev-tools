import { ref } from 'vue'

import type { LogLineType } from '@/components/logviewer/log-format'
import { useInterval } from '@/composables/use-interval'

import {
  checkPort,
  forceReleasePort,
  getRunJobLogs,
  openRunUrls,
  type RunJob,
  type StartRunInput,
} from '@/services/modules/run-service'
import type { Project } from '@/services/modules/project-service'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'
import { useRunStore, type PortAlert } from '@/stores/run'

import { formatModules } from '../run-format'

/** 强释确认弹窗需要的信息。 */
export interface ReleaseConfirm {
  projectName: string
  alert: PortAlert
  /** 该进程是否由本应用启动。非本应用进程要显著警示。 */
  looksExternal: boolean
  /** 强释成功后的启动意图，透传避免丢失模块/命令选择。 */
  intent: StartRunInput | null
}

/** 强释后确认端口真释放的轮询参数（替代固定延时，TIME_WAIT 回收慢时定长不够）。 */
const RELEASE_POLL_ATTEMPTS = 12
const RELEASE_POLL_INTERVAL = 250

const sleep = (ms: number) => new Promise<void>(resolve => { globalThis.setTimeout(resolve, ms) })

/**
 * 判断占用进程**是否可能由本应用启动**。
 *
 * 只有 nvm 目录下的 node 才算「像本应用启动的」——本应用通过 `getNodeBinPath`
 * 显式使用 `~/.nvm/versions/node/<ver>/bin`。Homebrew / 系统 / Volta 等其他
 * node 一律按外部进程处理。
 *
 * 判断不确定时**一律按外部**（更保守）：force-release 强杀整个进程组且不可撤销，
 * 误报「这是外部进程」只会让用户多看一眼，漏报则可能杀掉用户正在用的程序。
 */
function looksLikeExternalProcess(alert: PortAlert): boolean {
  const path = alert.commandPath.toLowerCase()
  if (!path) return true
  return !path.includes('/.nvm/versions/node/')
}

/** 启动期「已等待」计时：webpack 编译阶段 dev server 长时间不吐日志，面板像卡死。 */
function formatElapsed(seconds: number): string {
  const text = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return seconds >= 15 ? `· 已等待 ${text} · 编译较久属正常，请稍候` : `· 已等待 ${text}`
}

export function useRunActions() {
  const store = useRunStore()
  const logTask = useLogTaskStore()
  const notify = useNotificationStore()

  const elapsedFrom = ref(0)
  const elapsedRunning = ref(false)

  function renderElapsed() {
    // 切到部署任务则自停，避免在部署 footer 误显示等待计时
    if (logTask.kind !== 'run') {
      stopElapsed()
      return
    }
    logTask.setResult({ note: formatElapsed(Math.max(0, Math.floor((Date.now() - elapsedFrom.value) / 1000))) })
  }

  // useInterval 负责卸载时停表；这里手动控制启停时机
  const elapsedTimer = useInterval(renderElapsed, 1_000)
  elapsedTimer.clear()

  function stopElapsed() {
    elapsedTimer.clear()
    elapsedRunning.value = false
    logTask.setResult({ note: '' })
  }

  function startElapsed(startedAt: number) {
    elapsedFrom.value = startedAt || Date.now()
    if (elapsedRunning.value) return // 已在计时则只更新起点、不重启
    elapsedRunning.value = true
    renderElapsed()
    elapsedTimer.start()
  }

  /** 正在提交的项目名集合，用于禁用按钮防连点。 */
  const busy = ref<string[]>([])
  const releaseConfirm = ref<ReleaseConfirm | null>(null)

  const isBusy = (name: string) => busy.value.includes(name)

  async function withBusy<T>(name: string, task: () => Promise<T>): Promise<T | null> {
    if (isBusy(name)) return null
    busy.value = [...busy.value, name]
    try {
      return await task()
    } finally {
      busy.value = busy.value.filter(item => item !== name)
    }
  }

  /** 打开日志弹窗并接管为当前任务。 */
  function openLogShell(job: RunJob) {
    const isStarting = job.status === 'starting'
    logTask.open(
      {
        kind: 'run',
        id: job.id,
        projectName: job.projectName,
        title: '运行日志',
        subtitle: `${job.projectName}${formatModules(job, ' · ')}`,
      },
      { steps: ['启动中', '运行中'], running: true },
    )
    logTask.setProgress({
      percent: isStarting ? 0 : 100,
      indeterminate: isStarting,
      label: isStarting ? '启动中' : '运行中',
      tone: isStarting ? 'action' : 'success',
    })
    logTask.setResult({ icon: '▶', text: isStarting ? '正在启动本地服务' : '本地服务运行中' })
    if (!isStarting) logTask.activateStep(1)
    if (isStarting) startElapsed(job.startedAt)
    else stopElapsed()
  }

  /**
   * 依据 WS 推送更新日志弹窗的进度语义（P7：三态，不再停在中间百分比）。
   * 只处理当前弹窗对应的任务。
   */
  function syncLogStatus(job: RunJob) {
    if (logTask.taskId !== job.id) return
    if (job.status === 'starting') startElapsed(job.startedAt)
    else stopElapsed()
    logTask.setRunning(job.status === 'starting' || job.status === 'running')

    if (job.status === 'starting') {
      logTask.activateStep(0)
      logTask.setProgress({ percent: 0, indeterminate: true, label: '启动中', tone: 'action' })
      logTask.setResult({ icon: '▶', text: '正在启动本地服务' })
      return
    }
    if (job.status === 'running') {
      logTask.activateStep(1)
      if (job.compileStatus === 'error') {
        logTask.setProgress({ percent: 100, indeterminate: false, label: '编译报错', tone: 'danger' })
        logTask.setResult({ icon: '❌', text: `本地项目编译报错：${job.compileError || '请查看日志'}` })
      } else if (job.compileStatus === 'compiling') {
        // 服务在跑但本次编译时长未知，同样用不确定态
        logTask.setProgress({ percent: 100, indeterminate: true, label: '编译中', tone: 'action' })
        logTask.setResult({ icon: '●', text: '本地服务运行中，正在重新编译' })
      } else {
        const warned = job.compileStatus === 'warning'
        logTask.setProgress({ percent: 100, indeterminate: false, label: warned ? '有警告' : '运行中', tone: warned ? 'warning' : 'success' })
        logTask.setResult({ icon: '✅', text: job.url ? `本地服务运行中 · ${job.url}` : '本地服务运行中' })
      }
      return
    }
    const failed = job.status === 'error'
    logTask.finishAllSteps()
    logTask.setProgress({ percent: 100, indeterminate: false, label: failed ? '失败' : '已停止', tone: failed ? 'danger' : 'action' })
    logTask.setResult({
      icon: failed ? '❌' : '■',
      text: failed ? `本地服务异常退出：${job.error || '未知错误'}` : '本地服务已停止',
    })
  }

  async function start(project: Project, input: StartRunInput): Promise<RunJob | null> {
    return withBusy(project.name, async () => {
      try {
        const job = await store.start(input)
        openLogShell(job)
        return job
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '启动失败'
        // 端口被外部进程占用：转入诊断 + 强释确认，而不是抛个错就没下文
        if (/已被外部进程|EADDRINUSE/.test(message)) {
          const port = input.port || project.runPort || message.match(/端口\s*(\d{2,5})/)?.[1] || ''
          if (port) {
            const alert = await store.diagnosePort(project.name, port)
            if (alert) {
              releaseConfirm.value = {
                projectName: project.name,
                alert,
                looksExternal: looksLikeExternalProcess(alert),
                intent: input,
              }
              return null
            }
          }
        }
        notify.push(`启动失败：${message}`, 'error')
        return null
      }
    })
  }

  async function stop(projectName: string) {
    const job = store.jobOf(projectName)
    if (!job) {
      notify.push(`${projectName} 已不在运行`, 'info')
      return
    }
    await withBusy(projectName, async () => {
      try {
        await store.stop(job.id)
        notify.push(`正在停止 ${projectName}`, 'info')
      } catch (cause) {
        notify.push(`停止失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
      }
    })
  }

  /**
   * 重启：接口立即返回（后台才停+重启），因此**不能**用「请求结束即解锁」的写法。
   * store.restart 会保留 stopping 态任务，卡片按钮据此持续禁用直到 WS 推回 running。
   */
  async function restart(projectName: string) {
    const job = store.jobOf(projectName)
    if (!job || job.status !== 'running') return
    try {
      const next = await store.restart(projectName, job.id)
      openLogShell(next)
      notify.push(`正在重新运行 ${projectName}`, 'info')
    } catch (cause) {
      notify.push(`重启失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
    }
  }

  async function batchStop() {
    const names = store.runningProjectNames
    if (names.length === 0) {
      notify.push('没有正在运行的服务', 'info')
      return
    }
    try {
      await store.batchStop(names)
      notify.push(`正在停止 ${names.length} 个服务`, 'info')
    } catch (cause) {
      notify.push(`批量停止失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
    }
  }

  async function openUrls(projectName: string) {
    const job = store.jobOf(projectName)
    if (!job) {
      notify.push(`${projectName} 已不在运行`, 'info')
      return
    }
    await withBusy(projectName, async () => {
      try {
        const urls = await openRunUrls(job.id)
        notify.push(urls.length > 1 ? `已打开 ${urls.length} 个模块页面` : `已打开 ${urls[0] ?? '本地地址'}`, 'success')
      } catch (cause) {
        notify.push(`打开失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
      }
    })
  }

  /** WS 日志推送：只接受当前弹窗对应任务的行，避免旧任务滞后推送污染视图。 */
  function appendLog(taskId: string, text: string, type: string) {
    logTask.appendIfCurrent(taskId, text, type as LogLineType)
  }

  /** 打开日志并回放历史，先用本地 job 立即开窗避免接口慢时点了没反应。 */
  async function showLogs(projectName: string) {
    const job = store.jobOf(projectName)
    if (!job) {
      notify.push(`${projectName} 已不在运行`, 'info')
      return
    }
    openLogShell(job)
    logTask.append('正在加载历史日志…', 'info')
    try {
      const detail = await getRunJobLogs(job.id)
      logTask.replaceLines(detail.logs.map(entry => ({ text: entry.text, type: entry.type })))
    } catch (cause) {
      logTask.append(`加载历史日志失败: ${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
    }
  }

  /** 请求强释确认（由卡片「释放并启动」触发，intent 为空表示走收藏模块）。 */
  function requestRelease(projectName: string, intent: StartRunInput | null = null) {
    const alert = store.alertOf(projectName)
    if (!alert) return
    releaseConfirm.value = {
      projectName,
      alert,
      looksExternal: looksLikeExternalProcess(alert),
      intent,
    }
  }

  function cancelRelease() {
    releaseConfirm.value = null
  }

  /**
   * 用户已在弹窗里确认过占用进程详情后才会走到这里。
   *
   * ⚠️ forceReleasePort 强杀整个进程组且不校验归属，是全项目副作用最大的操作。
   */
  async function confirmRelease(resolveIntent: (projectName: string) => StartRunInput | null) {
    const request = releaseConfirm.value
    if (!request) return
    releaseConfirm.value = null
    const { projectName, alert } = request

    try {
      notify.push(`正在强制释放端口 ${alert.port}…`, 'warning')
      await forceReleasePort(alert.pid)
      store.clearPortAlert(projectName)

      // 轮询确认端口真的释放了；固定延时在 TIME_WAIT 回收慢时不够，会再次 EADDRINUSE
      if (alert.port) {
        for (let attempt = 0; attempt < RELEASE_POLL_ATTEMPTS; attempt += 1) {
          await sleep(RELEASE_POLL_INTERVAL)
          try {
            const result = await checkPort(alert.port)
            if (!result.inUse) break
          } catch {
            break
          }
        }
      } else {
        await sleep(500)
      }

      const intent = request.intent ?? resolveIntent(projectName)
      if (!intent) return
      const job = await store.start(intent)
      openLogShell(job)
      notify.push(`已释放端口并启动 ${projectName}`, 'success')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '未知错误'
      // 启动仍失败时复用诊断（可能换了占用进程），而不是直接报错走死路
      const project = store.jobOf(projectName)
      if (!project && alert.port) {
        await store.diagnosePort(projectName, alert.port).catch(() => null)
      }
      notify.push(`强释启动失败：${message}`, 'error')
    }
  }

  return {
    busy,
    isBusy,
    releaseConfirm,
    start,
    stop,
    restart,
    batchStop,
    openUrls,
    showLogs,
    requestRelease,
    cancelRelease,
    confirmRelease,
    syncLogStatus,
    appendLog,
  }
}
