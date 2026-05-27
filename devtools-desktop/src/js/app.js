// ========== app.js — Global State, Init, Shared Utilities ==========

// ========== State ==========
let projects = [];
let servers = [];
let nodeVersions = [];
let currentNodeVersion = '';
let currentProject = null;
let currentFilter = 'all';
let currentRunFilter = 'all';
let currentDeployId = null;
let availableProjects = [];
let checkedAvailableProjects = new Set();
let busyProjects = new Set();       // 防重复部署锁
let lastDeployCache = {};            // 项目最近部署记录缓存
let runningProjects = {};            // projectName -> 本地运行任务
let currentRunId = null;             // 当前日志弹窗展示的本地运行任务
let runModalProjectName = '';
let runModalMode = 'start';
let selectedRunModuleNames = new Set();
let notifiedRunIds = new Set();
let notifiedRunCompileErrors = new Set();
let pendingRunCompileErrorTimers = {};
const RUN_COMPILE_ERROR_NOTIFY_DELAY = 15000;
const APP_VERSION = '0.1.42';

// ========== 托盘菜单同步 ==========
function syncTrayMenu() {
  if (!window.__TAURI__?.core?.invoke) return;
  const running = Object.values(runningProjects || {})
    .filter(job => ['starting', 'running'].includes(job.status))
    .map(job => ({
      name: job.displayName || job.projectName || job.name || '未知项目',
      status: job.compileStatus === 'error' ? 'error' : job.status,
    }));
  window.__TAURI__.core.invoke('update_tray_menu', { projects: running }).catch(() => {});
}

// ========== 桌面通知 ==========
const NOTIFICATION_ENABLED_KEY = 'devtools-notifications-enabled';
const NOTIFICATION_ACTION_TTL = 2 * 60 * 1000;
let pendingNotificationAction = null;

function areNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== 'false';
}

function setNotificationsEnabled(enabled) {
  localStorage.setItem(NOTIFICATION_ENABLED_KEY, enabled ? 'true' : 'false');
}

function getTauriNotificationAPI() {
  return window.__TAURI__?.notification || null;
}

async function isNotificationPermissionGranted() {
  const tauriNotification = getTauriNotificationAPI();
  if (tauriNotification?.isPermissionGranted) {
    try {
      return await tauriNotification.isPermissionGranted();
    } catch (e) {
      console.warn('检查 Tauri 通知权限失败:', e);
    }
  }
  return 'Notification' in window && Notification.permission === 'granted';
}

async function requestNotificationPermission(options = {}) {
  const force = options.force === true;
  if (!force && !areNotificationsEnabled()) return false;

  const tauriNotification = getTauriNotificationAPI();
  if (tauriNotification?.requestPermission) {
    try {
      const permission = await tauriNotification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn('请求 Tauri 通知权限失败:', e);
    }
  }

  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return 'Notification' in window && Notification.permission === 'granted';
}

async function sendDesktopNotification(title, body, isSuccess, options = {}) {
  if (!areNotificationsEnabled() && !options.force) return;
  const granted = await requestNotificationPermission({ force: options.force });
  if (!granted) return;

  try {
    rememberNotificationAction(options);
    const tauriNotification = getTauriNotificationAPI();
    const notificationOptions = {
      title,
      body,
      group: 'devtools-tasks',
      autoCancel: true,
      extra: {
        status: isSuccess ? 'success' : 'fail',
        target: options.target || 'log',
      },
    };

    if (tauriNotification?.sendNotification) {
      tauriNotification.sendNotification(notificationOptions);
      return;
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notification = new Notification(title, {
      body,
      tag: 'devtools-' + Date.now(),
      requireInteraction: false,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      if (options.target === 'log') reopenLogModal();
      notification.close?.();
    };
    setTimeout(() => notification.close?.(), 10000);
  } catch (e) {
    console.warn('桌面通知发送失败:', e);
  }
}

function rememberNotificationAction(options = {}) {
  if (options.target !== 'log') return;
  if (!document.hidden && document.hasFocus?.()) return;

  pendingNotificationAction = {
    target: options.target,
    createdAt: Date.now(),
  };
}

function setupNotificationActionHandlers() {
  window.addEventListener('focus', handlePendingNotificationAction);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) handlePendingNotificationAction();
  });
}

function handlePendingNotificationAction() {
  if (!pendingNotificationAction) return;
  if (Date.now() - pendingNotificationAction.createdAt > NOTIFICATION_ACTION_TTL) {
    pendingNotificationAction = null;
    return;
  }

  const action = pendingNotificationAction;
  pendingNotificationAction = null;
  if (action.target === 'log') {
    setTimeout(() => reopenLogModal(), 80);
  }
}

let activeTask = null;               // 当前正在执行的任务 { id, projectName, isRunning }
let activeSysDialogClose = null;     // 当前系统弹窗的关闭回调

// ========== Custom System Dialog (替代 confirm / alert) ==========
function showConfirm(msg, opts = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    document.getElementById('sysDialogIcon').textContent = opts.icon || '⚠️';
    document.getElementById('sysDialogMsg').textContent = msg;
    const dangerCls = opts.danger ? ' danger' : '';
    document.getElementById('sysDialogBtns').innerHTML = `
      <button class="sys-btn-cancel" id="sysCancel">${opts.cancelText || '取消'}</button>
      <button class="sys-btn-confirm${dangerCls}" id="sysOk">${opts.confirmText || '确定'}</button>
    `;
    overlay.classList.add('active');
    const cleanup = (val) => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve(val);
    };
    activeSysDialogClose = cleanup;
    document.getElementById('sysCancel').onclick = () => cleanup(false);
    document.getElementById('sysOk').onclick = () => cleanup(true);
  });
}

function showAlert(msg, opts = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    document.getElementById('sysDialogIcon').textContent = opts.icon || 'ℹ️';
    document.getElementById('sysDialogMsg').textContent = msg;
    document.getElementById('sysDialogBtns').innerHTML = `
      <button class="sys-btn-ok" id="sysOk">${opts.okText || '知道了'}</button>
    `;
    overlay.classList.add('active');
    const cleanup = () => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve();
    };
    activeSysDialogClose = cleanup;
    document.getElementById('sysOk').onclick = cleanup;
  });
}

function showPrompt(msg, opts = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    document.getElementById('sysDialogIcon').textContent = opts.icon || '✏️';
    document.getElementById('sysDialogMsg').textContent = msg;
    document.getElementById('sysDialogBtns').innerHTML = `
      <input type="text" id="sysPromptInput" class="sys-prompt-input" placeholder="${opts.placeholder || ''}" value="${opts.defaultValue || ''}">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="sys-btn-cancel" id="sysCancel">${opts.cancelText || '取消'}</button>
        <button class="sys-btn-confirm" id="sysOk">${opts.confirmText || '确定'}</button>
      </div>
    `;
    overlay.classList.add('active');
    const input = document.getElementById('sysPromptInput');
    setTimeout(() => input?.focus(), 50);

    const cleanup = (val) => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve(val);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => cleanup(input?.value || '');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input?.value || '');
    });
  });
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await initAPI();
  WS.connect();
  setupWSHandlers();
  setupNavigation();
  setupModalDismissal();
  setupNotificationActionHandlers();
  requestNotificationPermission();
  await Promise.all([loadProjects(), loadServers(), loadNodeVersions()]);
  await loadHomeData();
  checkActiveJob();
  updateToolbarDate();
});

// ========== 主题切换 ==========
function initTheme() {
  const saved = localStorage.getItem('devtools-theme');
  const theme = saved || 'dark';
  document.body.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('devtools-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const el = document.getElementById('themeIcon');
  if (el) el.textContent = theme === 'dark' ? '☾' : '☀';
}

function initSidebarState() {
  const saved = sessionStorage.getItem('devtools-sidebar-collapsed');
  const collapsed = saved === null ? false : saved === 'true';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  updateSidebarCollapseIcon(collapsed);
}

function toggleSidebarCollapse() {
  const collapsed = !document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  sessionStorage.setItem('devtools-sidebar-collapsed', String(collapsed));
  updateSidebarCollapseIcon(collapsed);
}

function updateSidebarCollapseIcon(collapsed) {
  const btn = document.querySelector('.sidebar-collapse-toggle');
  if (!btn) return;
  const icon = btn.querySelector('.sidebar-collapse-icon');
  const label = btn.querySelector('.sidebar-collapse-label');
  if (icon) icon.textContent = collapsed ? '›' : '‹';
  if (label) label.textContent = collapsed ? '展开' : '收起';
  btn.title = collapsed ? '展开侧栏' : '折叠侧栏';
}

function openProjectIntro() {
  document.getElementById('projectIntroModal')?.classList.add('active');
  refreshProjectIntroStatus();
}

function setupModalDismissal() {
  document.addEventListener('mousedown', (event) => {
    const overlay = event.target;
    if (overlay?.classList?.contains('modal-overlay') && overlay.classList.contains('active')) {
      closeModal(overlay.id);
      return;
    }
    if (overlay?.id === 'sysDialog' && overlay.classList.contains('active') && activeSysDialogClose) {
      activeSysDialogClose(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    const logSearchBar = document.getElementById('logSearchBar');
    const logSearchInput = document.getElementById('logSearchInput');
    if (logSearchBar?.classList.contains('active') && document.activeElement === logSearchInput) {
      event.preventDefault();
      event.stopPropagation();
      closeLogSearch();
      return;
    }

    const sysDialog = document.getElementById('sysDialog');
    if (sysDialog?.classList.contains('active') && activeSysDialogClose) {
      event.preventDefault();
      event.stopPropagation();
      activeSysDialogClose(false);
      return;
    }

    const topModal = getTopActiveModal();
    if (topModal) {
      event.preventDefault();
      event.stopPropagation();
      closeModal(topModal.id);
    }
  }, true);
}

function getTopActiveModal() {
  const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
  if (activeModals.length === 0) return null;
  return activeModals
    .map((el, index) => ({
      el,
      index,
      zIndex: Number.parseInt(getComputedStyle(el).zIndex, 10) || 0,
    }))
    .sort((a, b) => (b.zIndex - a.zIndex) || (b.index - a.index))[0].el;
}

function updateToolbarDate() {
  const el = document.getElementById('toolbarDate');
  if (!el) return;
  const now = new Date();
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  el.textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

// ========== WebSocket Handlers ==========
function setupWSHandlers() {
  WS.on('log', (data) => {
    if (!currentDeployId && activeTask && activeTask.taskKind !== 'run') {
      appendLog(data.text, data.type);
      return;
    }
    if (data.id !== currentDeployId) return;
    appendLog(data.text, data.type);
  });

  WS.on('progress', (data) => {
    if (data.id !== currentDeployId && !(activeTask && !currentDeployId)) return;
    const pct = data.percent || 0;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressText').textContent = pct + '%';
  });

  WS.on('status', (data) => {
    if (data.id !== currentDeployId) {
      if (!(activeTask && !currentDeployId)) return;
      currentDeployId = data.id;
      if (activeTask) activeTask.id = data.id;
    }

    if (data.id.startsWith('test-') && data.phase === 'done') {
      document.querySelectorAll('.step').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
      document.getElementById('progressBar').style.width = '100%';
      document.getElementById('progressText').textContent = '';
      const result = document.getElementById('deployResult');
      result.style.display = 'flex';
      if (data.status === 'success') {
        document.getElementById('resultIcon').textContent = '✅';
        document.getElementById('resultText').innerHTML = `连接测试通过 <strong>${data.duration}ms</strong>`;
      } else {
        document.getElementById('resultIcon').textContent = '❌';
        document.getElementById('resultText').textContent = `连接失败: ${data.error || '未知错误'}`;
      }
      return;
    }

    const stepCount = getProgressStepCount();
    if (data.phase === 'preflight') {
      setStepActive(0);
    } else if (data.phase === 'pulling') {
      if (stepCount <= 2) { setStepActive(0); }
      else { setStepDone(0); setStepActive(1); }
    } else if (data.phase === 'building') {
      if (stepCount <= 2) { setStepDone(0); setStepActive(1); }
      else { setStepDone(0); setStepDone(1); setStepActive(2); }
    } else if (data.phase === 'uploading') {
      if (stepCount > 3) { setStepDone(0); setStepDone(1); setStepDone(2); setStepActive(3); }
    } else if (data.phase === 'done') {
      document.querySelectorAll('.step').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
      document.getElementById('progressBar').style.width = '100%';
      document.getElementById('progressText').textContent = '100%';
      const result = document.getElementById('deployResult');
      result.style.display = 'flex';
      if (data.status === 'success') {
        const doneLabel = data.type === 'build-only' ? '构建完成' : '部署完成';
        document.getElementById('resultIcon').textContent = '✅';
        document.getElementById('resultText').innerHTML = `${doneLabel}！耗时 <strong>${data.duration}</strong>`;
      } else {
        const failLabel = data.type === 'build-only' ? '构建失败' : '部署失败';
        document.getElementById('resultIcon').textContent = '❌';
        document.getElementById('resultText').textContent = failLabel;
      }
      if (activeTask) activeTask.isRunning = false;
      updateLogModalCloseBtn();
      const logModal = document.getElementById('logModal');
      if (!logModal.classList.contains('active')) {
        logModal.classList.add('active');
        showToast(data.status === 'success' ? '✅ 任务完成' : '❌ 任务失败', data.projectName);
      }
      if (data.projectName) clearBusy(data.projectName);
      const typeText = data.type === 'build-only' ? '构建' : '部署';
      const statusText = data.status === 'success' ? '成功' : '失败';
      const notifyBody = data.status === 'success'
        ? `${data.projectName} ${typeText}完成，耗时 ${data.duration}`
        : `${data.projectName} ${typeText}失败`;
      sendDesktopNotification(`${typeText}${statusText}`, notifyBody, data.status === 'success', { target: 'log' });
      loadProjects();
    }
  });

  WS.on('run-log', (data) => {
    if (data.id !== currentRunId) return;
    appendLog(data.text, data.type);
  });

  WS.on('run-status', (data) => {
    const isActive = ['starting', 'running'].includes(data.status);
    if (isActive) runningProjects[data.projectName] = data;
    else delete runningProjects[data.projectName];

    if (data.status === 'running' && !notifiedRunIds.has(data.id)) {
      notifiedRunIds.add(data.id);
      const modulesText = (data.moduleNames || []).length ? ` · ${(data.moduleNames || []).join(', ')}` : '';
      const urlText = data.url ? `\n${data.url}` : '';
      sendDesktopNotification('本地运行成功', `${data.projectName}${modulesText} 已启动${urlText}`, true, { target: 'log' });
    }
    handleRunCompileErrorNotification(data);
    if (!isActive && data.id) {
      notifiedRunIds.delete(data.id);
      clearRunCompileErrorTimers(data.id);
    }

    if (data.id === currentRunId) updateRunLogStatus(data);
    renderProjects();
    renderRunPage();
    refreshHomeIfVisible();
    syncTrayMenu();
  });
}

function clearRunCompileErrorTimers(jobId) {
  Object.keys(pendingRunCompileErrorTimers)
    .filter(key => key.startsWith(`${jobId}:`))
    .forEach(key => {
      clearTimeout(pendingRunCompileErrorTimers[key]);
      delete pendingRunCompileErrorTimers[key];
    });
}

function handleRunCompileErrorNotification(data) {
  if (!data.id) return;
  if (data.compileStatus !== 'error') {
    clearRunCompileErrorTimers(data.id);
    return;
  }
  if (!data.compileErrorSeq) return;

  const errorKey = `${data.id}:${data.compileErrorSeq}`;
  if (notifiedRunCompileErrors.has(errorKey) || pendingRunCompileErrorTimers[errorKey]) return;

  pendingRunCompileErrorTimers[errorKey] = setTimeout(() => {
    delete pendingRunCompileErrorTimers[errorKey];
    const latest = runningProjects[data.projectName];
    if (!latest || latest.id !== data.id || latest.compileStatus !== 'error' || latest.compileErrorSeq !== data.compileErrorSeq) return;

    notifiedRunCompileErrors.add(errorKey);
    const modulesText = (latest.moduleNames || []).length ? ` · ${(latest.moduleNames || []).join(', ')}` : '';
    sendDesktopNotification('本地项目编译报错', `${latest.projectName}${modulesText}\n${latest.compileError || '请查看运行日志'}`, false, { target: 'log' });
    showToast('❌ 本地项目编译报错', latest.projectName, { clickable: true });
  }, RUN_COMPILE_ERROR_NOTIFY_DELAY);
}

// ========== 侧边栏菜单配置（动态渲染 + 排序） ==========
const SIDEBAR_MENU_ITEMS = [
  { page: 'home', label: '首页', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', fixed: 'first' },
  { page: 'run', label: '本地运行', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></svg>' },
  { page: 'deploy', label: '部署面板', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>' },
  { page: 'terminal', label: '快捷命令', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' },
  { page: 'todo', label: '待办', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
  { page: 'report', label: 'Git 周报', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
  { page: 'notes', label: '工时内容', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>' },
  { page: 'notebook', label: '笔记本', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  { page: 'settings', label: '设置', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 9 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', fixed: 'last' }
];

const MENU_ORDER_KEY = 'devtools-menu-order';
const DEFAULT_MENU_ORDER = ['run', 'deploy', 'terminal', 'todo', 'report', 'notes', 'notebook'];

function getMenuOrder() {
  try {
    const saved = localStorage.getItem(MENU_ORDER_KEY);
    if (saved) {
      const order = JSON.parse(saved);
      const sortablePages = SIDEBAR_MENU_ITEMS.filter(m => !m.fixed).map(m => m.page);
      const valid = order.every(p => sortablePages.includes(p)) && order.length === sortablePages.length;
      if (valid) return order;
    }
  } catch (e) {}
  return DEFAULT_MENU_ORDER;
}

function saveMenuOrder(order) {
  localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(order));
}

function getSortedMenuItems() {
  const order = getMenuOrder();
  const first = SIDEBAR_MENU_ITEMS.find(m => m.fixed === 'first');
  const last = SIDEBAR_MENU_ITEMS.find(m => m.fixed === 'last');
  const middle = order.map(page => SIDEBAR_MENU_ITEMS.find(m => m.page === page)).filter(Boolean);
  return [first, ...middle, last];
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  const activePage = nav.querySelector('.sidebar-item.active')?.dataset.page || 'home';
  const items = getSortedMenuItems();
  nav.innerHTML = items.map(item => {
    const isActive = item.page === activePage ? ' active' : '';
    return `<button class="sidebar-item${isActive}" data-page="${item.page}" onclick="switchPage('${item.page}', this)"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`;
  }).join('');
}

function renderMenuOrderSettings() {
  const container = document.getElementById('menuOrderList');
  if (!container) return;
  const order = getMenuOrder();
  container.innerHTML = order.map((page, idx) => {
    const item = SIDEBAR_MENU_ITEMS.find(m => m.page === page);
    if (!item) return '';
    const isFirst = idx === 0;
    const isLast = idx === order.length - 1;
    return `<div class="menu-order-item" data-page="${page}">
      <span class="menu-order-icon">${item.icon}</span>
      <span class="menu-order-label">${item.label}</span>
      <span class="menu-order-actions">
        <button class="menu-order-btn" ${isFirst ? 'disabled' : ''} onclick="moveMenuItem('${page}','up')" title="上移">↑</button>
        <button class="menu-order-btn" ${isLast ? 'disabled' : ''} onclick="moveMenuItem('${page}','down')" title="下移">↓</button>
      </span>
    </div>`;
  }).join('');
}

function moveMenuItem(page, direction) {
  const order = getMenuOrder();
  const idx = order.indexOf(page);
  if (idx === -1) return;
  if (direction === 'up' && idx > 0) {
    [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  } else if (direction === 'down' && idx < order.length - 1) {
    [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
  }
  saveMenuOrder(order);
  renderSidebar();
  renderMenuOrderSettings();
}

function resetMenuOrder() {
  localStorage.removeItem(MENU_ORDER_KEY);
  renderSidebar();
  renderMenuOrderSettings();
}

// ========== Navigation ==========
function setupNavigation() {
  renderSidebar();
  initSidebarState();
  const collapseBtn = document.querySelector('.sidebar-collapse-toggle');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebarCollapse();
    });
  }

  document.querySelectorAll('#sub-dashboard .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#sub-dashboard .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderProjects();
    });
  });

  let _searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(renderProjects, 150);
  });
  const runSearchInput = document.getElementById('runSearchInput');
  let _runSearchTimer = null;
  if (runSearchInput) runSearchInput.addEventListener('input', () => {
    clearTimeout(_runSearchTimer);
    _runSearchTimer = setTimeout(renderRunPage, 150);
  });
  document.querySelectorAll('#page-run .chip[data-run-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#page-run .chip[data-run-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentRunFilter = chip.dataset.runFilter;
      renderRunPage();
    });
  });

  initHomePage();
}

// ========== 页面切换 ==========
function switchPage(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(d => d.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const navEl = el || document.querySelector(`.sidebar-item[data-page="${page}"], .dock-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  const main = document.querySelector('.main-content');
  if (main) {
    main.scrollTop = 0;
    main.scrollLeft = 0;
    if (page === 'home') {
      main.classList.add('home-active');
    } else {
      main.classList.remove('home-active');
    }
  }
  const activePage = document.getElementById('page-' + page);
  if (activePage) { activePage.scrollTop = 0; activePage.scrollLeft = 0; }
  if (page === 'deploy') {
    const activeSub = document.querySelector('.sub-tab.active');
    if (activeSub) switchSubTab(activeSub.dataset.sub, activeSub);
  }
  if (page === 'run') {
    loadRunStatuses().then(() => renderRunPage());
  }
  if (page === 'home') {
    loadRunStatuses().then(() => loadHomeData());
  }
  if (page === 'report') initReport();
  if (page === 'settings') loadSettings();
  if (page === 'todo') loadTodos();
  if (page === 'notes') loadNotes();
  if (page === 'notebook') initNotebook();
  if (page === 'terminal') loadCommands();
}

// ========== 子 Tab 切换 ==========
function switchSubTab(sub, btn) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const subPage = document.getElementById('sub-' + sub);
  subPage.classList.add('active');
  subPage.scrollTop = 0;
  const scrollTarget = subPage.querySelector('.project-grid, .server-list, .history-table');
  if (scrollTarget) scrollTarget.scrollTop = 0;
  if (sub === 'servers') loadServers();
  if (sub === 'history') loadHistory();
}

// ========== Shared Utilities ==========
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return `${d}天前`;
}

function setBusy(projectName) {
  busyProjects.add(projectName);
  renderProjects();
}

function clearBusy(projectName) {
  busyProjects.delete(projectName);
  delete lastDeployCache[projectName];
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setStepActive(idx) {
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.toggle('active', i === idx);
    if (i < idx) s.classList.add('done');
  });
}

function setStepDone(idx) {
  const step = document.getElementById('step' + idx);
  if (step) { step.classList.remove('active'); step.classList.add('done'); }
}

function getProgressStepCount() {
  return document.querySelectorAll('#progressSteps .step').length;
}

// ========== Log Modal ==========
function appendLog(text, type = 'info') {
  const terminal = document.getElementById('logTerminal');
  const MAX_LOG_LINES = 3000;
  while (terminal.childElementCount >= MAX_LOG_LINES) {
    terminal.removeChild(terminal.firstChild);
  }
  const clsMap = { cmd: 'log-cmd', info: 'log-info', success: 'log-success', warn: 'log-warn', error: 'log-error' };
  const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
  const div = document.createElement('div');
  div.className = `log-line ${clsMap[type] || 'log-info'}`;
  div.textContent = clean;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

// ========== 日志搜索 ==========
let logSearchMatches = [];
let logSearchCurrentIdx = -1;

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const logModal = document.getElementById('logModal');
    if (logModal.classList.contains('active')) {
      e.preventDefault();
      openLogSearch();
    }
  }
});

function openLogSearch() {
  const bar = document.getElementById('logSearchBar');
  bar.classList.add('active');
  document.getElementById('logSearchInput').focus();
}

function closeLogSearch() {
  document.getElementById('logSearchBar').classList.remove('active');
  document.getElementById('logSearchInput').value = '';
  clearLogHighlights();
  logSearchMatches = [];
  logSearchCurrentIdx = -1;
  document.getElementById('logSearchInfo').textContent = '';
}

function doLogSearch() {
  const keyword = document.getElementById('logSearchInput').value.trim();
  clearLogHighlights();
  logSearchMatches = [];
  logSearchCurrentIdx = -1;

  if (!keyword) { document.getElementById('logSearchInfo').textContent = ''; return; }

  const terminal = document.getElementById('logTerminal');
  const lines = terminal.querySelectorAll('.log-line');
  const lowerKey = keyword.toLowerCase();

  lines.forEach(line => {
    if (line.textContent.toLowerCase().includes(lowerKey)) {
      line.classList.add('log-highlight');
      logSearchMatches.push(line);
    }
  });

  if (logSearchMatches.length > 0) {
    logSearchCurrentIdx = 0;
    logSearchMatches[0].classList.add('log-highlight-active');
    logSearchMatches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  updateLogSearchInfo();
}

function logSearchNext() {
  if (logSearchMatches.length === 0) return;
  logSearchMatches[logSearchCurrentIdx].classList.remove('log-highlight-active');
  logSearchCurrentIdx = (logSearchCurrentIdx + 1) % logSearchMatches.length;
  logSearchMatches[logSearchCurrentIdx].classList.add('log-highlight-active');
  logSearchMatches[logSearchCurrentIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  updateLogSearchInfo();
}

function logSearchPrev() {
  if (logSearchMatches.length === 0) return;
  logSearchMatches[logSearchCurrentIdx].classList.remove('log-highlight-active');
  logSearchCurrentIdx = (logSearchCurrentIdx - 1 + logSearchMatches.length) % logSearchMatches.length;
  logSearchMatches[logSearchCurrentIdx].classList.add('log-highlight-active');
  logSearchMatches[logSearchCurrentIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  updateLogSearchInfo();
}

function logSearchKeydown(e) {
  if (e.key === 'Enter') { e.shiftKey ? logSearchPrev() : logSearchNext(); }
  if (e.key === 'Escape') closeLogSearch();
}

function updateLogSearchInfo() {
  const info = document.getElementById('logSearchInfo');
  if (logSearchMatches.length === 0) { info.textContent = '无匹配'; }
  else { info.textContent = `${logSearchCurrentIdx + 1}/${logSearchMatches.length}`; }
}

function clearLogHighlights() {
  document.querySelectorAll('.log-line.log-highlight').forEach(el => {
    el.classList.remove('log-highlight', 'log-highlight-active');
  });
}

// ========== Modal Utils ==========
function closeModal(id) {
  if (id === 'logModal' && activeTask && activeTask.isRunning) {
    document.getElementById(id).classList.remove('active');
    const title = activeTask.taskKind === 'run' ? '▶ 本地服务仍在运行' : '📌 任务仍在后台运行';
    const message = activeTask.taskKind === 'run' ? '点击此处可查看运行日志' : '点击此处可查看进度';
    showToast(title, message, { clickable: true, persistent: true });
    return;
  }
  document.getElementById(id).classList.remove('active');
  if (id === 'logModal') {
    activeTask = null;
  }
}

function reopenLogModal() {
  const logModal = document.getElementById('logModal');
  if (logModal) logModal.classList.add('active');
}

function updateLogModalCloseBtn() {
  const closeBtn = document.querySelector('#logModal .modal-footer .btn-secondary');
  const closeIcon = document.querySelector('#logModal .modal-close');
  if (activeTask && activeTask.isRunning) {
    if (closeBtn) closeBtn.textContent = '最小化';
    if (closeIcon) closeIcon.title = '最小化到后台';
  } else {
    if (closeBtn) closeBtn.textContent = '关闭';
    if (closeIcon) closeIcon.title = '关闭';
  }
}

// ========== Toast ==========
function showToast(title, message, options = {}) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast-item${options.clickable ? ' clickable' : ''}`;

  const dismissToast = () => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  };

  toast.innerHTML = `
    <span class="toast-close">&times;</span>
    <div class="toast-title">${title}</div>
    ${message ? `<div class="toast-message">${message}</div>` : ''}
  `;

  toast.querySelector('.toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast();
  });

  if (options.clickable) {
    toast.addEventListener('click', () => {
      reopenLogModal();
      dismissToast();
    });
  }

  container.appendChild(toast);

  if (!options.persistent) {
    setTimeout(dismissToast, 5000);
  }
}

// ========== 刷新后活跃任务恢复 ==========
let _checkActiveJobRunning = false;
async function checkActiveJob() {
  if (_checkActiveJobRunning) return;
  if (activeTask && activeTask.isRunning && currentDeployId) return;
  _checkActiveJobRunning = true;
  try {
    const job = await API.get('/api/deploy/active');
    if (!job) return;

    if (Date.now() - job.startTime > 5 * 60 * 1000) {
      console.log('[checkActiveJob] 任务已超时，跳过恢复:', job.projectName);
      return;
    }

    currentDeployId = job.id;
    activeTask = { id: job.id, projectName: job.projectName, isRunning: true };
    setBusy(job.projectName);

    const isBuildOnly = job.type === 'build';
    const typeLabel = isBuildOnly ? '构建' : '部署';
    document.getElementById('logTitle').textContent = `${typeLabel}进度`;
    document.getElementById('logSubtitle').textContent = `${job.projectName} · ${job.modules.join(', ')}`;
    document.getElementById('logTerminal').innerHTML = '';
    document.getElementById('deployResult').style.display = 'none';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';

    const steps = isBuildOnly
      ? ['拉取代码', '构建中']
      : ['预检', '拉取代码', '构建中', '上传中', '完成'];
    document.getElementById('progressSteps').innerHTML = steps.map((s, i) =>
      `<div class="step" id="step${i}"><div class="step-dot"></div>${s}</div>`
    ).join('');

    const phaseMap = job.type === 'build-only'
      ? { pulling: 0, building: 1 }
      : { preflight: 0, pulling: 1, building: 2, uploading: 3 };
    const activeIdx = phaseMap[job.phase] ?? 0;
    for (let i = 0; i < activeIdx; i++) setStepDone(i);
    setStepActive(activeIdx);

    if (job.logs && job.logs.length > 0) {
      const terminal = document.getElementById('logTerminal');
      const fragment = document.createDocumentFragment();
      const clsMap = { cmd: 'log-cmd', info: 'log-info', success: 'log-success', warn: 'log-warn', error: 'log-error' };
      job.logs.forEach(log => {
        const clean = log.text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
        const div = document.createElement('div');
        div.className = `log-line ${clsMap[log.type] || 'log-info'}`;
        div.textContent = clean;
        fragment.appendChild(div);
      });
      terminal.appendChild(fragment);
      terminal.scrollTop = terminal.scrollHeight;
    }

    document.getElementById('logModal').classList.add('active');
    updateLogModalCloseBtn();

    const elapsed = Math.round((Date.now() - job.startTime) / 1000);
    showToast(`🔄 恢复${typeLabel}任务`, `${job.projectName} 已运行 ${elapsed}s`, { clickable: true });
  } catch (e) {
    console.warn('[checkActiveJob]', e.message);
  } finally {
    _checkActiveJobRunning = false;
  }
}
