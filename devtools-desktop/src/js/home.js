/* 首页兼容桥：保留旧 app.js / WebSocket 调用点，实际视图已迁移到 Vue。 */

let _homeVueMounted = false;

function mountVueHome() {
  const root = document.getElementById('vue-home-root');
  if (!root || !window.DevToolsHomeApp) return null;
  const app = window.DevToolsHomeApp.mount(root);
  _homeVueMounted = Boolean(app);
  return app;
}

function initHomePage() {
  mountVueHome();
}

function updateHomeDateTime() {
  // Vue 首页由组件内部的响应式时钟更新；保留该函数供旧导航入口安全调用。
  mountVueHome();
}

async function loadHomeData() {
  mountVueHome();
  return window.DevToolsHomeApp?.refresh?.();
}

function refreshHomeIfVisible() {
  const page = document.getElementById('page-home');
  if (!page?.classList.contains('active')) return;
  window.DevToolsHomeApp?.notifyRuntimeChange?.();
}
