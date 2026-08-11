// ========== app.js — Global State, Init, Shared Utilities ==========

// ========== State ==========
// project / server / node 全局已随构建部署弹窗迁入 Vue 退役；各 Vue 页自行拉数。
let currentRunFilter = 'all';
// availableProjects / checkedAvailableProjects 随添加项目弹窗迁入 Vue 一并退役。
let notifiedRunIds = new Set();
let notifiedRunCompileErrors = new Set();
let pendingRunCompileErrorTimers = {};
const RUN_COMPILE_ERROR_NOTIFY_DELAY = 15000;
let APP_VERSION = '0.1.93';

// ========== Vue Migration Bridge ==========
const LEGACY_PAGE_ACTIVATED_EVENT = 'devtools:legacy-page-activated';
const LEGACY_PAGE_REQUESTED_EVENT = 'devtools:legacy-page-requested';
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
  // Vue 各页自行加载项目 / 服务器 / Node 版本数据
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

    // 日志搜索的 Esc 已由 Vue LogViewer 自行处理，这里不再拦截。
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
  /*
    构建 / 部署的 log、progress、status 三条链路已由 Vue 的
    `services/deploy-realtime-service.ts` 全量承担（随应用常驻，含刷新恢复与
    WS 重连对账）。run-log 由 useRunRealtime 处理。这里不能保留并行处理器——
    两侧会同时写同一个 log store，表现为每行日志追加两次、完成时弹两次提示。
   */

  WS.on('upgrade-progress', (data) => {
    window.dispatchEvent(new CustomEvent(UPGRADE_PROGRESS_EVENT, { detail: data }));
  });

  /*
    只保留桌面通知与去重记账。运行态、托盘菜单与首页刷新已由 Vue 的
    run store + run-runtime-service 承担（后者随应用常驻，不依赖页面挂载）。
   */
  WS.on('run-status', async (data) => {
    const isActive = ['starting', 'running'].includes(data.status);

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
    const latest = window.__runActiveJob?.(data.projectName);
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

  emitLegacyPageActivation('home', 'legacy');
}

// ========== 页面切换 ==========
// 离开守卫：Vue 侧 `registerPageLeaveGuard` 经 window.__devtoolsRunPageLeaveGuards 注入。
// 编辑器脏标签确认必须在改 .page.active 之前完成（KeepAlive onDeactivated 已太晚）。
let switchPageBusy = false;

function switchPage(page, el, source = 'legacy') {
  const targetPage = document.getElementById('page-' + page);
  if (!targetPage) {
    console.warn('[Navigation] 未找到目标页面:', page);
    return;
  }
  if (switchPageBusy) return;

  const currentPageEl = document.querySelector('.page.active');
  const currentPage = currentPageEl && currentPageEl.id
    ? currentPageEl.id.replace(/^page-/, '')
    : null;

  const applySwitch = () => {
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
    targetPage.scrollTop = 0;
    targetPage.scrollLeft = 0;
    const scrollBody = targetPage.querySelector('.page-scroll-body');
    if (scrollBody) scrollBody.scrollTop = 0;
    if (page === 'deploy') {
      const activeSub = document.querySelector('#page-deploy .seg__item.is-active');
      if (activeSub) switchSubTab(activeSub.dataset.sub, activeSub);
    }
    // editor 已迁 Vue：不再调用 initEditor()
    if (page === 'terminal') loadCommands();
    emitLegacyPageActivation(page, source);
  };

  if (
    currentPage
    && currentPage !== page
    && typeof window.__devtoolsRunPageLeaveGuards === 'function'
  ) {
    switchPageBusy = true;
    Promise.resolve(window.__devtoolsRunPageLeaveGuards(currentPage))
      .then((ok) => {
        if (ok) applySwitch();
      })
      .catch(() => { /* 守卫异常视为取消离开 */ })
      .finally(() => { switchPageBusy = false; });
    return;
  }

  applySwitch();
}

// ========== 子 Tab 切换 ==========
function switchSubTab(sub, btn) {
  document.querySelectorAll('#page-deploy .seg__item').forEach(t => t.classList.remove('is-active'));
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  btn.classList.add('is-active');
  const subPage = document.getElementById('sub-' + sub);
  subPage.classList.add('active');
  subPage.scrollTop = 0;
  // 三个子页均已迁到 Vue，取数与滚动复位都由各自宿主监听本事件自行处理
  window.dispatchEvent(new CustomEvent('devtools:legacy-subtab-activated', { detail: { sub } }));
}

// ========== Shared Utilities ==========
// 防重复部署锁（原 busyProjects / setBusy / clearBusy）已归 Vue 的 deploy-task
// store：卡片忙态、WS 消息归属与失败解锁都由它单点维护，见 stores/deploy-task.ts。

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

// 桌面通知 / Toast 点回日志：经事件交给 MigrationHost → logTask.reopen()
function reopenLogModal() {
  window.dispatchEvent(new CustomEvent('devtools:log-reopen-requested'));
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

// 供 Vue LogViewer 的源码链接调用：路径与行号已由组件解析好，projectName 由其
// 自身的任务态提供，不再依赖旧 activeTask 全局。
async function openFileInEditorByPath(filepath, line, projectName = '') {
  try {
    await API.post('/api/run/open-editor', { projectName, path: filepath, line: parseInt(line) || 1 });
    showToast('正在编辑器中定位代码...', filepath);
  } catch (err) {
    showToast('无法定位代码: ' + err.message);
  }
}

window.openFileInEditorByPath = openFileInEditorByPath;

// Vue 侧的 todo-reminder-service 与 deploy-realtime-service 都要发桌面通知，而本
// 函数的权限申请、Tauri/Web 双通道与「点通知回到日志」记账尚未迁入 Vue。顶层
// function 在传统脚本里不会成为 window 属性，须显式挂载（同 WS 的处理方式）。
window.sendDesktopNotification = sendDesktopNotification;

// ========== Modal Utils ==========
// `logModal` 分支已删除：日志弹窗的关闭/最小化由 Vue LogViewer 自身的
// requestClose 处理（running 时发 minimize 事件，MigrationHost 接住并给 Toast），
// legacy 侧已无命令式调用。这里只剩普通弹窗的 DOM 开关。
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
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

// 刷新后的活跃任务恢复（原 checkActiveJob）已归 Vue 的 deploy-realtime-service：
// 它在启动与 WS 重连时各对账一次，且恢复后任务态直接落在 deploy-task store，
// 卡片忙态与后续 WS 消息归属都能跟上。

// ========== 自动更新及全局状态管理 ==========
// 自动更新提示已被彻底清空，仅保留设置页面中的一键覆盖重新打包升级能力
