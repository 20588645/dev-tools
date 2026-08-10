export const ADD_PROJECT_REQUESTED_EVENT = 'devtools:add-project-requested'
export const PROJECTS_CHANGED_EVENT = 'devtools:projects-changed'

/**
 * 添加项目弹窗的开合与刷新事件。
 *
 * 弹窗有**三个入口**，且分属不同的挂载层级：部署面板 legacy 页头的按钮、
 * 部署面板项目总览的空态按钮、本地运行页（Vue）页头与空态的按钮。迁移前这
 * 三处都是 `onclick="showAddProject()"`，共用同一个弹窗与同一份项目数据。
 *
 * 弹窗因此随 `MigrationHost` 常驻（与 LogViewer 同级），而非挂在某个页面里：
 * 部署面板的三个子页与本地运行页都在 `KeepAlive` 下，切走即 deactivated，
 * 弹窗挂在其中任一页内部时，从别处点按钮不会有任何反应。
 *
 * 反向还需要一条：弹窗与这些页面不再是父子关系，添加成功后用
 * `PROJECTS_CHANGED_EVENT` 通知它们刷新项目列表。
 *
 * `installAddProjectBridge` 只为 legacy 页头的 `onclick` 服务，页头迁入 Vue
 * 后可删；两个事件本身是 Vue 侧的跨页通信，会保留。
 */

declare global {
  interface Window {
    /** 由 `index.html` 页头的 `onclick="showAddProject()"` 调用。 */
    showAddProject?: () => void
  }
}

export function installAddProjectBridge(): () => void {
  const open = () => window.dispatchEvent(new CustomEvent(ADD_PROJECT_REQUESTED_EVENT))
  window.showAddProject = open
  return () => {
    if (window.showAddProject === open) delete window.showAddProject
  }
}

/** Vue 侧（项目总览空态、本地运行页页头与空态）主动拉起弹窗，不绕 window 全局。 */
export function requestAddProject() {
  window.dispatchEvent(new CustomEvent(ADD_PROJECT_REQUESTED_EVENT))
}

export function onAddProjectRequested(listener: () => void) {
  const handler = () => listener()
  window.addEventListener(ADD_PROJECT_REQUESTED_EVENT, handler)
  return () => window.removeEventListener(ADD_PROJECT_REQUESTED_EVENT, handler)
}

/** 项目增删后广播，让项目总览子页静默刷新。 */
export function emitProjectsChanged() {
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT))
}

export function onProjectsChanged(listener: () => void) {
  const handler = () => listener()
  window.addEventListener(PROJECTS_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, handler)
}
