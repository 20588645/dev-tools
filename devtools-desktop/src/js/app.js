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
let portOccupancyAlerts = {};        // projectName -> 端口占用诊断信息
let currentRunId = null;             // 当前日志弹窗展示的本地运行任务
let runModalProjectName = '';
let runModalMode = 'start';
let selectedRunModuleNames = new Set();
let notifiedRunIds = new Set();
let notifiedRunCompileErrors = new Set();
let pendingRunCompileErrorTimers = {};
const RUN_COMPILE_ERROR_NOTIFY_DELAY = 15000;
let APP_VERSION = '0.1.93';

// ========== Vue Migration Bridge ==========
const LEGACY_PAGE_ACTIVATED_EVENT = 'devtools:legacy-page-activated';
const LEGACY_PAGE_REQUESTED_EVENT = 'devtools:legacy-page-requested';
const HOME_REFRESH_REQUESTED_EVENT = 'devtools:home-refresh-requested';
const MENU_ORDER_CHANGED_EVENT = 'devtools:menu-order-changed';
const EXPERIMENTAL_SETTING_CHANGED_EVENT = 'devtools:experimental-setting-changed';
const SIDECAR_RESTARTED_EVENT = 'devtools:sidecar-restarted';
const UPGRADE_PROGRESS_EVENT = 'devtools:upgrade-progress';
const LIVE2D_ENABLED_KEY = 'devtools-live2d-enabled';
const CLICK_EFFECT_ENABLED_KEY = 'devtools-click-effect-enabled';
let vueNavigationBridgeBound = false;
let clickEffectActive = false;

function isLive2dEnabled() {
  return localStorage.getItem(LIVE2D_ENABLED_KEY) === 'true';
}

function setLive2dEnabled(enabled) {
  localStorage.setItem(LIVE2D_ENABLED_KEY, enabled ? 'true' : 'false');
  const waifu = document.getElementById('waifu');
  if (!enabled) {
    if (waifu) waifu.style.display = 'none';
    return;
  }
  if (waifu) {
    waifu.style.display = '';
    return;
  }
  if (document.getElementById('live2d-widget-script')) return;
  const script = document.createElement('script');
  script.id = 'live2d-widget-script';
  script.src = 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.0/dist/autoload.js';
  script.onerror = () => {
    console.warn('Live2D 看板娘加载失败，请检查网络连接');
    showToast('⚠️ 看板娘加载失败', '请检查网络连接');
  };
  document.body.appendChild(script);
}

function handleClickParticle(event) {
  const colors = [
    'rgba(167, 139, 250, 0.9)',
    'rgba(129, 140, 248, 0.9)',
    'rgba(96, 165, 250, 0.85)',
    'rgba(52, 211, 153, 0.85)',
    'rgba(251, 191, 36, 0.85)',
    'rgba(244, 114, 182, 0.9)',
    'rgba(248, 113, 113, 0.85)',
  ];
  const particleCount = 7;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('div');
    const angle = (Math.PI * 2 * index) / particleCount + (Math.random() - 0.5) * 0.8;
    const distance = 30 + Math.random() * 40;
    const size = 4 + Math.random() * 4;
    particle.className = 'click-particle';
    particle.style.left = event.clientX + 'px';
    particle.style.top = event.clientY + 'px';
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
    particle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
    document.body.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove());
  }
}

function setClickEffectEnabled(enabled) {
  localStorage.setItem(CLICK_EFFECT_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled === clickEffectActive) return;
  clickEffectActive = enabled;
  document[enabled ? 'addEventListener' : 'removeEventListener']('click', handleClickParticle, true);
}

function restoreExperimentalPreferences() {
  if (isLive2dEnabled()) {
    setTimeout(() => setLive2dEnabled(true), 1500);
  }
  if (localStorage.getItem(CLICK_EFFECT_ENABLED_KEY) === 'true') {
    setClickEffectEnabled(true);
  }
}

function emitLegacyPageActivation(pageId, source = 'legacy') {
  window.dispatchEvent(new CustomEvent(LEGACY_PAGE_ACTIVATED_EVENT, {
    detail: { pageId, source },
  }));
}

function setupVueNavigationBridge() {
  if (vueNavigationBridgeBound) return;
  vueNavigationBridgeBound = true;
  window.addEventListener(LEGACY_PAGE_REQUESTED_EVENT, (event) => {
    const pageId = event.detail?.pageId;
    if (!pageId || !document.getElementById('page-' + pageId)) return;
    const nav = document.querySelector(`.sidebar-item[data-page="${pageId}"], .dock-item[data-page="${pageId}"]`);
    switchPage(pageId, nav, 'vue');
  });
  window.addEventListener(MENU_ORDER_CHANGED_EVENT, () => {
    renderSidebar();
  });
  window.addEventListener(EXPERIMENTAL_SETTING_CHANGED_EVENT, (event) => {
    const { key, enabled } = event.detail || {};
    if (key === 'live2d') setLive2dEnabled(Boolean(enabled));
    if (key === 'click-effect') setClickEffectEnabled(Boolean(enabled));
  });
  window.addEventListener(SIDECAR_RESTARTED_EVENT, (event) => {
    const port = Number(event.detail?.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    API_BASE = 'http://127.0.0.1:' + port;
    clearTimeout(WS.reconnectTimer);
    if (WS.socket) {
      try {
        WS.socket.onclose = null;
        WS.socket.close();
      } catch (e) {}
    }
    WS.reconnectAttempts = 0;
    WS.connect(port);
  });
  window.addEventListener('devtools:connection-timeout-changed', (event) => {
    const seconds = Number(event.detail?.seconds);
    if (Number.isFinite(seconds)) connTimeoutSec = Math.min(Math.max(seconds, 5), 300);
  });
}

function requestHomeRefreshIfVisible(reason = 'runtime-change') {
  const page = document.getElementById('page-home');
  if (!page?.classList.contains('active')) return;
  window.dispatchEvent(new CustomEvent(HOME_REFRESH_REQUESTED_EVENT, {
    detail: { reason },
  }));
}

// ========== 托盘菜单同步 ==========
function syncTrayMenu() {
  const invoke = (typeof getTauriInvoke === 'function') ? getTauriInvoke() : null;
  if (!invoke) return;
  const running = Object.values(runningProjects || {})
    .filter(job => ['starting', 'running'].includes(job.status))
    .map(job => ({
      name: job.displayName || job.projectName || job.name || '未知项目',
      status: job.compileStatus === 'error' ? 'error' : job.status,
    }));
  invoke('update_tray_menu', { projects: running }).catch(() => {});
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
    const okVariant = opts.danger ? 'btn--danger' : 'btn--primary';
    document.getElementById('sysDialogBtns').innerHTML = `
      <button class="btn" id="sysCancel">${opts.cancelText || '取消'}</button>
      <button class="btn ${okVariant}" id="sysOk">${opts.confirmText || '确定'}</button>
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
      <button class="btn btn--primary" id="sysOk">${opts.okText || '知道了'}</button>
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
        <button class="btn" id="sysCancel">${opts.cancelText || '取消'}</button>
        <button class="btn btn--primary" id="sysOk">${opts.confirmText || '确定'}</button>
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
  restoreExperimentalPreferences();
  await initAPI();
  loadAppSettings();
  WS.connect();
  setupWSHandlers();
  setupNavigation();
  setupModalDismissal();
  setupNotificationActionHandlers();
  requestNotificationPermission();
  await Promise.all([loadProjects(), loadServers(), loadNodeVersions()]);
  checkActiveJob();
  updateToolbarDate();
});

// ========== 主题切换 ==========
const THEME_STORAGE_KEY = 'devtools-theme';
const THEME_MODE_VALUES = ['system', 'light', 'dark'];
let systemThemeMediaQuery = null;
let systemThemeListenerBound = false;
let themeBodyObserver = null;

function normalizeThemeMode(value) {
  return THEME_MODE_VALUES.includes(value) ? value : 'system';
}

function getSystemThemeMediaQuery() {
  if (!systemThemeMediaQuery && typeof window.matchMedia === 'function') {
    systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  }
  return systemThemeMediaQuery;
}

function getSystemTheme() {
  return getSystemThemeMediaQuery()?.matches ? 'dark' : 'light';
}

function resolveThemeMode(mode) {
  return mode === 'system' ? getSystemTheme() : mode;
}

function getThemeMode() {
  const bodyMode = document.body.getAttribute('data-theme-mode');
  return normalizeThemeMode(bodyMode || localStorage.getItem(THEME_STORAGE_KEY));
}

function applyThemeMode(mode, options = {}) {
  const normalizedMode = normalizeThemeMode(mode);
  const effectiveTheme = resolveThemeMode(normalizedMode);
  document.body.setAttribute('data-theme-mode', normalizedMode);
  document.body.setAttribute('data-theme', effectiveTheme);
  if (options.persist !== false) localStorage.setItem(THEME_STORAGE_KEY, normalizedMode);
  updateThemeIcon(normalizedMode, effectiveTheme);
  window.dispatchEvent(new CustomEvent('devtools:theme-changed', {
    detail: { mode: normalizedMode, theme: effectiveTheme },
  }));
  return effectiveTheme;
}

function bindSystemThemeListener() {
  const mediaQuery = getSystemThemeMediaQuery();
  if (!mediaQuery || systemThemeListenerBound) return;
  const handleSystemThemeChange = () => {
    if (getThemeMode() === 'system') applyThemeMode('system', { persist: false });
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleSystemThemeChange);
  }
  systemThemeListenerBound = true;
}

function initTheme() {
  const savedMode = normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  applyThemeMode(savedMode, { persist: false });
  bindSystemThemeListener();
  ensureThemeModeMenu();
  if (!themeBodyObserver) {
    themeBodyObserver = new MutationObserver(() => updateThemeIcon(getThemeMode()));
    themeBodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-mode'],
    });
  }
}

function toggleTheme() {
  const currentIndex = THEME_MODE_VALUES.indexOf(getThemeMode());
  const nextMode = THEME_MODE_VALUES[(currentIndex + 1) % THEME_MODE_VALUES.length];
  applyThemeMode(nextMode);
}

function setThemeMode(mode) {
  applyThemeMode(mode);
  closeThemeModeMenu(true);
}

function getThemeModeLabel(mode, effectiveTheme) {
  if (mode === 'system') return `跟随系统（当前${effectiveTheme === 'dark' ? '暗色' : '亮色'}）`;
  return mode === 'dark' ? '暗色模式' : '亮色模式';
}

function updateThemeMenuSelection(mode) {
  const menu = document.getElementById('themeModeMenu');
  if (!menu) return;
  menu.querySelectorAll('[data-theme-mode]').forEach(option => {
    option.setAttribute('aria-checked', String(option.dataset.themeMode === mode));
  });
}

function updateThemeIcon(mode, effectiveTheme = document.body.getAttribute('data-theme') || resolveThemeMode(mode)) {
  const el = document.getElementById('themeIcon');
  if (el) el.textContent = mode === 'system' ? '◐' : effectiveTheme === 'dark' ? '☾' : '☀';
  const toggle = document.getElementById('themeModeToggle');
  if (toggle) {
    const label = `外观：${getThemeModeLabel(mode, effectiveTheme)}`;
    toggle.setAttribute('title', label);
    toggle.setAttribute('aria-label', label);
    toggle.dataset.themeMode = mode;
  }
  updateThemeMenuSelection(mode);
}

function ensureThemeModeMenu() {
  let menu = document.getElementById('themeModeMenu');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'themeModeMenu';
  menu.className = 'theme-mode-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '主题模式');
  menu.hidden = true;
  menu.innerHTML = `
    <button class="theme-mode-option" type="button" role="menuitemradio" aria-checked="false" data-theme-mode="system">
      <span class="theme-mode-option-icon" aria-hidden="true">◐</span>
      <span class="theme-mode-option-copy"><strong>跟随系统</strong><small>随 macOS 外观自动切换</small></span>
      <span class="theme-mode-option-check" aria-hidden="true">✓</span>
    </button>
    <button class="theme-mode-option" type="button" role="menuitemradio" aria-checked="false" data-theme-mode="light">
      <span class="theme-mode-option-icon" aria-hidden="true">☀</span>
      <span class="theme-mode-option-copy"><strong>亮色</strong><small>始终使用亮色外观</small></span>
      <span class="theme-mode-option-check" aria-hidden="true">✓</span>
    </button>
    <button class="theme-mode-option" type="button" role="menuitemradio" aria-checked="false" data-theme-mode="dark">
      <span class="theme-mode-option-icon" aria-hidden="true">☾</span>
      <span class="theme-mode-option-copy"><strong>暗色</strong><small>始终使用暗色外观</small></span>
      <span class="theme-mode-option-check" aria-hidden="true">✓</span>
    </button>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', event => {
    const option = event.target.closest('[data-theme-mode]');
    if (option) setThemeMode(option.dataset.themeMode);
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeThemeModeMenu(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...menu.querySelectorAll('[data-theme-mode]')];
    const currentIndex = options.indexOf(document.activeElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  });
  document.addEventListener('pointerdown', event => {
    const toggle = document.getElementById('themeModeToggle');
    if (!menu.hidden && !menu.contains(event.target) && !toggle?.contains(event.target)) {
      closeThemeModeMenu();
    }
  });
  window.addEventListener('resize', () => closeThemeModeMenu());
  updateThemeMenuSelection(getThemeMode());
  return menu;
}

function positionThemeModeMenu(menu) {
  const toggle = document.getElementById('themeModeToggle');
  if (!toggle) return;
  const toggleRect = toggle.getBoundingClientRect();
  const margin = 8;
  let left = toggleRect.right + margin;
  if (left + menu.offsetWidth > window.innerWidth - margin) {
    left = toggleRect.left - menu.offsetWidth - margin;
  }
  const preferredTop = toggleRect.top + (toggleRect.height - menu.offsetHeight) / 2;
  const top = Math.min(
    Math.max(margin, preferredTop),
    Math.max(margin, window.innerHeight - menu.offsetHeight - margin),
  );
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function openThemeModeMenu() {
  const menu = ensureThemeModeMenu();
  const toggle = document.getElementById('themeModeToggle');
  updateThemeMenuSelection(getThemeMode());
  menu.hidden = false;
  positionThemeModeMenu(menu);
  toggle?.setAttribute('aria-expanded', 'true');
  menu.querySelector('[aria-checked="true"]')?.focus();
}

function closeThemeModeMenu(restoreFocus = false) {
  const menu = document.getElementById('themeModeMenu');
  const toggle = document.getElementById('themeModeToggle');
  if (menu) menu.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle?.focus();
}

function toggleThemeMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const menu = ensureThemeModeMenu();
  if (menu.hidden) openThemeModeMenu();
  else closeThemeModeMenu(true);
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

  WS.on('upgrade-progress', (data) => {
    window.dispatchEvent(new CustomEvent(UPGRADE_PROGRESS_EVENT, { detail: data }));
  });

  async function checkPortOccupancyForProject(projectName, port) {
    if (!port) return;
    try {
      const res = await API.get('/api/run/port-owner/' + port);
      if (res && res.inUse) {
        portOccupancyAlerts[projectName] = {
          port: port,
          pid: res.pid,
          pids: res.pids,
          user: res.user,
          command: res.command,
          commandPath: res.commandPath
        };
      } else {
        delete portOccupancyAlerts[projectName];
      }
    } catch (err) {
      console.error('[Port Diagnosis] Failed to check port owner:', err);
    }
  }

  window.checkPortOccupancyForProject = checkPortOccupancyForProject;

  // WS 重连后全量对账：断线期间的 run-status 推送会全部丢失，重连后从后端拉一次
  // 真实运行态，纠正可能失真的卡片/统计（首连也会触发，loadRunStatuses 幂等故安全）
  WS.on('open', () => {
    loadRunStatuses().then(() => {
      renderProjects();
      renderRunPage();
      requestHomeRefreshIfVisible();
      syncTrayMenu();
    });
  });

  WS.on('run-status', async (data) => {
    const isActive = ['starting', 'running'].includes(data.status);
    if (isActive) {
      runningProjects[data.projectName] = data;
      delete portOccupancyAlerts[data.projectName];
    } else {
      delete runningProjects[data.projectName];
      if (data.status === 'error' && data.port) {
        await checkPortOccupancyForProject(data.projectName, data.port);
      }
    }

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
      clearNotifiedCompileErrors(data.id);
    }

    if (data.id === currentRunId) updateRunLogStatus(data);
    renderProjects();
    renderRunPage();
    requestHomeRefreshIfVisible();
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

// 任务结束时清理其编译报错去重记录，避免 notifiedRunCompileErrors 只增不删导致
// 长期运行缓慢内存增长（与 notifiedRunIds.delete / clearRunCompileErrorTimers 生命周期对齐）
function clearNotifiedCompileErrors(jobId) {
  [...notifiedRunCompileErrors].forEach(key => {
    if (key.startsWith(`${jobId}:`)) notifiedRunCompileErrors.delete(key);
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
  { page: 'home', label: '应用首页', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', fixed: 'first' },
  { page: 'run', label: '本地运行', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></svg>' },
  { page: 'deploy', label: '部署面板', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>' },
  { page: 'filetransfer', label: '文件传输', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="9" y2="7"/><polyline points="7 13 3 17 7 21"/><line x1="3" y1="17" x2="15" y2="17"/></svg>' },
  { page: 'terminal', label: '快捷命令', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' },
  { page: 'todo', label: '待办事项', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
  { page: 'notes', label: '工时内容', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>' },
  { page: 'notebook', label: '个人笔记', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  { page: 'editor', label: '文件编辑', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 12 8 14 10 16"/><polyline points="14 12 16 14 14 16"/></svg>' },
  { page: 'ipcheck', label: '纯净检测', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
  { page: 'twofa', label: '双因验证', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>' },
  { page: 'usage', label: '用量统计', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
  { page: 'settings', label: '系统设置', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 9 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', fixed: 'last' }
];

const MENU_ORDER_KEY = 'devtools-menu-order';
const DEFAULT_MENU_ORDER = ['run', 'deploy', 'filetransfer', 'terminal', 'todo', 'notes', 'notebook', 'editor', 'ipcheck', 'twofa', 'usage'];

function getMenuOrder() {
  try {
    const saved = localStorage.getItem(MENU_ORDER_KEY);
    if (saved) {
      const order = JSON.parse(saved);
      const sortablePages = SIDEBAR_MENU_ITEMS.filter(m => !m.fixed).map(m => m.page);
      const normalized = Array.isArray(order) ? order.filter(p => sortablePages.includes(p)) : [];
      const missing = sortablePages.filter(p => !normalized.includes(p));
      if (normalized.length === sortablePages.length) return normalized;
      if (normalized.length) return [...normalized, ...missing];
    }
  } catch (e) {}
  return DEFAULT_MENU_ORDER;
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
    const isUpdateDot = '';
    return `<button class="sidebar-item${isActive}" data-page="${item.page}" onclick="switchPage('${item.page}', this)"><span class="nav-icon">${item.icon}</span><span>${item.label}</span>${isUpdateDot}</button>`;
  }).join('');
}

// ========== 公共页面顶部组件（吸附式） ==========
// 约定：新功能页面的标题区 + 工具栏统一包在 <div class="page-fixed-header"> 内，
// 滚动时自动吸附在顶部（毛玻璃背景，吸附后出现分隔线）。静态页面直接套类即可；
// 动态页面可用 renderPageHeader() 按标准结构渲染。初始化由 setupNavigation 自动完成。
function initPageStickyHeaders() {
  document.querySelectorAll('.page .page-fixed-header').forEach(header => {
    const page = header.closest('.page');
    if (!page || page._fixedHeaderBound) return;
    page._fixedHeaderBound = true;
    page.classList.add('has-fixed-header');
    const body = page.querySelector('.page-scroll-body');
    if (body) {
      body.addEventListener('scroll', () => {
        header.classList.toggle('is-stuck', body.scrollTop > 4);
      }, { passive: true });
    }
  });
}

/**
 * 动态渲染标准页面顶部。page 为页面名（对应 #page-<name> 内的 .page-fixed-header 容器）。
 * opts: { icon, title, subtitle, actionsHTML, toolbarHTML }
 */
function renderPageHeader(page, opts = {}) {
  const host = document.querySelector(`#page-${page} .page-fixed-header`);
  if (!host) return;
  host.innerHTML = `
    <div class="page-header-bar page-header-simple">
      <div>
        <div class="page-title">${opts.icon ? opts.icon + ' ' : ''}${opts.title || ''}</div>
        ${opts.subtitle ? `<div class="page-subtitle">${opts.subtitle}</div>` : ''}
      </div>
      ${opts.actionsHTML ? `<div class="page-header-actions">${opts.actionsHTML}</div>` : ''}
    </div>
    ${opts.toolbarHTML ? `<div class="page-toolbar">${opts.toolbarHTML}</div>` : ''}`;
}

// ========== Navigation ==========
function setupNavigation() {
  renderSidebar();
  setupVueNavigationBridge();
  initSidebarState();
  initPageStickyHeaders();
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

  emitLegacyPageActivation('home', 'legacy');
}

// ========== 页面切换 ==========
function switchPage(page, el, source = 'legacy') {
  // 离开本地运行页时停掉其轮询（运行时长刷新 + 起停对账），避免后台空转
  if (typeof stopRunPagePolling === 'function') stopRunPagePolling();
  const targetPage = document.getElementById('page-' + page);
  if (!targetPage) {
    console.warn('[Navigation] 未找到目标页面:', page);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(d => d.classList.remove('active'));
  targetPage.classList.add('active');
  const navEl = el || document.querySelector(`.sidebar-item[data-page="${page}"], .dock-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  const main = document.querySelector('.main-content');
  if (main) {
    main.scrollTop = 0;
    main.scrollLeft = 0;
    main.classList.toggle('home-active', page === 'home');
  }
  const activePage = targetPage;
  if (activePage) {
    activePage.scrollTop = 0;
    activePage.scrollLeft = 0;
    const scrollBody = activePage.querySelector('.page-scroll-body');
    if (scrollBody) scrollBody.scrollTop = 0;
  }
  if (page === 'deploy') {
    const activeSub = document.querySelector('#page-deploy .seg__item.is-active');
    if (activeSub) switchSubTab(activeSub.dataset.sub, activeSub);
  }
  if (page === 'filetransfer') initFileTransfer();
  if (page === 'run') {
    loadRunStatuses().then(() => renderRunPage());
    startRunPagePolling();
  }
  if (page === 'editor') initEditor();
  if (page === 'terminal') loadCommands();
  emitLegacyPageActivation(page, source);
}

// ========== 子 Tab 切换 ==========
function switchSubTab(sub, btn) {
  document.querySelectorAll('#page-deploy .seg__item').forEach(t => t.classList.remove('is-active'));
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  btn.classList.add('is-active');
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

// escapeHtml 的权威定义在下方日志区（含引号转义与空值兜底）；此处曾有旧版重复定义，已清理
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 用于内联 onclick="fn('${escapeOnclickArg(x)}')" 的【JS 字符串参数】转义。
// 关键：浏览器执行 onclick 前会先做一次 HTML 实体解码，escapeAttr 把 ' 编成 &#39; 会被还原成字面 '，
// 仍会断裂单引号字符串（含可执行注入）。故必须先做 JS 字符串层转义（\ 与 ' 与换行），
// 再做 HTML 实体编码（& < > "）——解码后恰好是合法 JS 字符串字面量。
// 注意：仅用于 onclick 的 JS 字符串值；普通属性值（title/data-*）仍用 escapeAttr。
function escapeOnclickArg(str) {
  return String(str == null ? '' : str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 统一渲染三态占位（空态/加载/失败），配套 css/state.css 的 .state 组件。
// opts: { kind:'empty'|'loading'|'error', icon, title, desc, actionHTML, block, sm }
// title/desc 自动转义；actionHTML 是调用方可信 HTML（放 .btn 等）。
function renderState(el, opts = {}) {
  if (!el) return;
  const { kind = 'empty', icon = '', title = '', desc = '', actionHTML = '', block = false, sm = false } = opts;
  const cls = ['state',
    kind === 'error' ? 'state--error' : '',
    block ? 'state--block' : '',
    sm ? 'state--sm' : ''].filter(Boolean).join(' ');
  const head = kind === 'loading'
    ? '<div class="state__spinner"></div>'
    : (icon ? `<div class="state__icon">${icon}</div>` : '');
  el.innerHTML = `<div class="${cls}">
    ${head}
    ${title ? `<div class="state__title">${escapeHtml(title)}</div>` : ''}
    ${desc ? `<div class="state__desc">${escapeHtml(desc)}</div>` : ''}
    ${actionHTML ? `<div class="state__action">${actionHTML}</div>` : ''}
  </div>`;
}

// 分段控件 .seg 的互斥高亮收口：把点击项设 is-active、同组其余移除（配 css/segmented.css）
function segActivate(el) {
  const seg = el && el.closest('.seg');
  if (!seg) return;
  seg.querySelectorAll('.seg__item').forEach(item => item.classList.toggle('is-active', item === el));
}

// 异步操作期间锁定按钮：防连点重复请求 + 给即时进行态反馈；无论成败都恢复
// btn 已 disabled（上次请求未完成）时直接忽略本次点击；按钮在请求中被重渲移除则跳过恢复
async function withButtonBusy(btn, busyText, fn) {
  if (btn && btn.disabled) return;
  const orig = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    if (busyText) btn.innerHTML = busyText;
  }
  try {
    return await fn();
  } finally {
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
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
// 智能滚动：内容未占满容器时强制回到顶部（保证日志开头/盒子头部不被裁切）；
// 占满时仅在用户原本就在底部时跟随到最新。用 rAF 等布局结算，规避弹窗开场动画期间的瞬态尺寸。
function scrollLogTerminal(terminal, wasAtBottom = true) {
  if (!terminal) return;
  requestAnimationFrame(() => {
    if (terminal.scrollHeight <= terminal.clientHeight + 2) {
      terminal.scrollTop = 0;
    } else if (wasAtBottom) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  });
}

function appendLog(text, type = 'info') {
  const terminal = document.getElementById('logTerminal');
  const MAX_LOG_LINES = 3000;
  while (terminal.childElementCount >= MAX_LOG_LINES) {
    terminal.removeChild(terminal.firstChild);
  }
  const clsMap = { cmd: 'log-cmd', info: 'log-info', success: 'log-success', warn: 'log-warn', error: 'log-error' };
  const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
  
  let finalType = type;
  
  // 识别并拦截 HPM 代理报错，强行降级为 warn，不显示为红色
  const isHpmError = /\[HPM\]\s+Error/i.test(clean);
  if (isHpmError) {
    finalType = 'warn';
  } else if (type === 'info') {
    const hasError = /ERROR|Exception|Failed|TypeError|ReferenceError|CompileError|ValidationError/i.test(clean);
    const hasWarning = /WARN|Warning|Deprecated|Deprecation/i.test(clean);
    const hasSuccess = /SUCCESS|Compiled successfully|Listening at/i.test(clean);

    if (hasError) {
      finalType = 'error';
    } else if (hasWarning) {
      finalType = 'warn';
    } else if (hasSuccess) {
      finalType = 'success';
    }
  }

  const atBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 60;
  const div = document.createElement('div');
  div.className = `log-line ${clsMap[finalType] || 'log-info'}`;
  div.innerHTML = colorizeAndLinkLog(ansiToHtml(text));
  terminal.appendChild(div);
  scrollLogTerminal(terminal, atBottom);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ansiToHtml(text) {
  const colors = {
    30: 'var(--text-muted, #6b7280)', // black / gray
    31: 'var(--danger, #ef4444)',      // red
    32: 'var(--success, #10b981)',     // green
    33: 'var(--warning, #f59e0b)',     // yellow
    34: 'var(--accent, #6366f1)',      // blue
    35: '#d946ef',                     // magenta
    36: '#06b6d4',                     // cyan
    37: '#f3f4f6',                     // white
    90: '#9ca3af',                     // bright black (gray)
  };

  let html = escapeHtml(text);

  // 把 \x1b[1m 替换成 <strong>，\x1b[22m 替换成 </strong>
  html = html.replace(/\x1B\[1m/gi, '<strong>');
  html = html.replace(/\x1B\[22m/gi, '</strong>');

  let openSpans = 0;
  html = html.replace(/\x1B\[([0-9;]*)m/g, (match, codeStr) => {
    const codes = codeStr.split(';');
    let style = '';
    let reset = false;

    for (const code of codes) {
      const num = parseInt(code);
      if (num === 0 || num === 39) {
        reset = true;
      } else if (colors[num]) {
        style += `color: ${colors[num]};`;
      }
    }

    if (reset) {
      let closes = '';
      while (openSpans > 0) {
        closes += '</span>';
        openSpans--;
      }
      return closes;
    } else if (style) {
      openSpans++;
      return `<span style="${style}">`;
    }
    return '';
  });

  while (openSpans > 0) {
    html += '</span>';
    openSpans--;
  }

  return html;
}

function colorizeAndLinkLog(cleanText) {
  if (/https?:\/\//i.test(cleanText)) {
    return cleanText;
  }

  const pathRegex = /(?:^|\s|file:\/\/\/|at\s+|internal\/)([\w.\-_/\\+]+?\.(?:js|ts|jsx|tsx|vue|css|scss|less|html|json)):(\d+)(?::(\d+))?\b/gi;
  return cleanText.replace(pathRegex, (match, filepath, line, col) => {
    const displayPath = filepath.length > 35 ? '...' + filepath.slice(-32) : filepath;
    const lineLabel = col ? `${line}:${col}` : line;
    return ` <a href="#" class="log-editor-link" data-path="${encodeURIComponent(filepath)}" data-line="${line}" onclick="openFileInEditor(event, this)">${displayPath}:${lineLabel}</a>`;
  });
}

async function openFileInEditor(e, el) {
  e.preventDefault();
  const filepath = decodeURIComponent(el.dataset.path);
  const line = el.dataset.line || '1';
  const projectName = (typeof activeTask !== 'undefined' && activeTask) ? (activeTask.projectName || '') : '';
  try {
    await API.post('/api/run/open-editor', { projectName, path: filepath, line: parseInt(line) });
    showToast('正在编辑器中定位代码...', filepath);
  } catch (err) {
    showToast('无法定位代码: ' + err.message);
  }
}

window.openFileInEditor = openFileInEditor;

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
  if (id === 'logModal' && typeof stopRunStartElapsed === 'function') stopRunStartElapsed();
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
      scrollLogTerminal(terminal, true);
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

// ========== 自动更新及全局状态管理 ==========
// 自动更新提示已被彻底清空，仅保留设置页面中的一键覆盖重新打包升级能力
