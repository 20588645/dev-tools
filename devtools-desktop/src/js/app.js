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

function setupVueCompatBridge() {
  if (vueNavigationBridgeBound) return;
  vueNavigationBridgeBound = true;
  // P8-6：导航权威已是 Vue Router；此处只保留非导航兼容事件
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
  setupVueCompatBridge();
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
  // P8-4：Vue 挂载后由 Pinia 单一写入；legacy 只转发
  if (typeof window.__devtoolsApplyThemeMode === 'function') {
    window.__devtoolsApplyThemeMode(mode, options);
    const normalizedMode = normalizeThemeMode(mode);
    const effectiveTheme = document.body.getAttribute('data-theme') || resolveThemeMode(normalizedMode);
    updateThemeIcon(normalizedMode, effectiveTheme);
    return effectiveTheme;
  }
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
  // P8-4：系统主题监听归 Pinia startThemeSync；legacy 不再绑定，避免双监听
  return;
}

function initTheme() {
  // Vue 就绪前先刷一遍 DOM，避免 FOUC；系统监听与持久权威交给 Pinia
  const savedMode = normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  applyThemeMode(savedMode, { persist: false });
  ensureThemeModeMenu();
  window.addEventListener('devtools:theme-changed', (event) => {
    const detail = event.detail || {};
    updateThemeIcon(
      normalizeThemeMode(detail.mode || getThemeMode()),
      detail.theme || document.body.getAttribute('data-theme') || resolveThemeMode(getThemeMode()),
    );
  });
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
