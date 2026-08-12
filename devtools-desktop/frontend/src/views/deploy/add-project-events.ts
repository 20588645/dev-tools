export const ADD_PROJECT_REQUESTED_EVENT = 'devtools:add-project-requested'
export const PROJECTS_CHANGED_EVENT = 'devtools:projects-changed'

/**
 * 添加项目弹窗的开合与刷新事件（P9-8 自 add-project-bridge 收编，
 * window.showAddProject 桥随旧页头删除）。
 *
 * 弹窗有多个入口且分属不同挂载层级：部署面板项目总览的页头与空态、
 * 本地运行页的页头与空态。弹窗随 AppShellServices 常驻（与 LogViewer 同级），
 * 各页在 `KeepAlive` 下切走即 deactivated，弹窗挂在任一页内部时其余入口会失效。
 *
 * 反向一条：添加成功后用 `PROJECTS_CHANGED_EVENT` 通知各页静默刷新项目列表。
 */

/** 页面主动拉起弹窗（项目总览 / 本地运行页的页头与空态按钮）。 */
export function requestAddProject() {
  window.dispatchEvent(new CustomEvent(ADD_PROJECT_REQUESTED_EVENT))
}

export function onAddProjectRequested(listener: () => void) {
  const handler = () => listener()
  window.addEventListener(ADD_PROJECT_REQUESTED_EVENT, handler)
  return () => window.removeEventListener(ADD_PROJECT_REQUESTED_EVENT, handler)
}

/** 项目增删后广播，让项目总览 / 本地运行页静默刷新。 */
export function emitProjectsChanged() {
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT))
}

export function onProjectsChanged(listener: () => void) {
  const handler = () => listener()
  window.addEventListener(PROJECTS_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, handler)
}
