/** 部署面板的纯展示格式化函数。 */

/**
 * 相对时间。与旧 `timeAgo` 保持同样的分档，避免迁移后同一条记录读起来变了。
 *
 * 超过 30 天直接给天数而不是「1 个月前」：部署记录里"83 天前"比"2 个月前"
 * 更能说明这个项目有多久没动过。
 */
export function formatDeployAgo(timestamp: number, now = Date.now()): string {
  if (!timestamp) return '未知时间'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

/** 历史记录时间：只到分钟，年份对排查无意义（与本地运行页一致）。 */
export function formatDeployTime(timestamp: number): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export interface DeployStatusView {
  label: string
  tone: 'success' | 'danger'
}

export function formatDeployStatus(status: 'success' | 'error'): DeployStatusView {
  return status === 'success'
    ? { label: '成功', tone: 'success' }
    : { label: '失败', tone: 'danger' }
}

/**
 * Git 提交相对时间。与旧 `gitTimeAgo` 同分档，含「昨天」——比笼统的「1天前」
 * 更贴近「刚刚发过 / 昨天发过」的决策语境。
 */
export function formatGitCommitAgo(timestamp: number, now = Date.now()): string {
  if (!timestamp) return '未知时间'
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  return `${days}天前`
}

/** 文件大小，用于远程目录浏览。 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}
