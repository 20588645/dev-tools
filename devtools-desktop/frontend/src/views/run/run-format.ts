import type { RunHistoryItem, RunJob } from '@/services/modules/run-service'

/** 本地运行页的纯展示格式化函数。 */

/** 运行时长。startedAt 缺失时显示「刚刚」而不是 0s，避免误导。 */
export function formatUptime(startedAt: number, now = Date.now()): string {
  if (!startedAt) return '刚刚'
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** 模块列表；无模块视为整体项目。 */
export function formatModules(job: Pick<RunJob, 'moduleNames' | 'moduleName'>, prefix = ''): string {
  const modules = job.moduleNames.length > 0
    ? job.moduleNames
    : (job.moduleName ? [job.moduleName] : [])
  return modules.length > 0 ? `${prefix}${modules.join(', ')}` : `${prefix}整体项目`
}

/** 卡片上展示的访问地址。启动中尚未拿到地址时给出等待提示而非空白。 */
export function formatJobUrl(job: Pick<RunJob, 'url' | 'port'> | null): string {
  if (!job) return '未启动'
  if (job.url) return job.url
  return job.port ? `http://localhost:${job.port}` : '等待地址'
}

export interface HistoryStatusView {
  label: string
  tone: 'success' | 'neutral' | 'danger'
}

/**
 * 运行历史三档状态。
 *
 * 旧实现这三档形同虚设：后端入库时把 `stopped` 改写成 `success`（F2），
 * 于是「手动停止」永远走不到。修好后端后这里才有意义。
 */
export function formatHistoryStatus(status: RunHistoryItem['status']): HistoryStatusView {
  if (status === 'success') return { label: '已结束', tone: 'success' }
  if (status === 'stopped') return { label: '手动停止', tone: 'neutral' }
  return { label: '异常退出', tone: 'danger' }
}

/** 历史记录时间：只到分钟，年份对排查无意义。 */
export function formatHistoryTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/** 卡片状态文本：启动中 / 运行中。 */
export function formatJobStateLabel(job: Pick<RunJob, 'status'>): string {
  return job.status === 'starting' ? '启动中' : job.status === 'stopping' ? '停止中' : '运行中'
}
