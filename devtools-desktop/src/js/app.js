// ========== State ==========
let projects = [];
let servers = [];
let nodeVersions = [];
let currentNodeVersion = '';
let currentProject = null;
let currentFilter = 'all';
let currentDeployId = null;
let availableProjects = [];
let checkedAvailableProjects = new Set();
let busyProjects = new Set();       // 防重复部署锁
let lastDeployCache = {};            // 项目最近部署记录缓存

// ========== 浏览器桌面通知 ==========
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendDesktopNotification(title, body, isSuccess) {
  // 无论页面是否可见都发送通知
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: 'deploy-panel-' + Date.now(),
      requireInteraction: true,  // 通知不会自动消失，需要用户手动关闭
      silent: false,
    });
    // 点击通知时聚焦窗口
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    // 10秒后自动关闭
    setTimeout(() => notification.close(), 10000);
  } catch (e) {
    console.warn('桌面通知发送失败:', e);
  }
}
let activeTask = null;               // 当前正在执行的任务 { id, projectName, isRunning }
let activeSysDialogClose = null;     // 当前系统弹窗的关闭回调

// ========== Custom System Dialog (替代 confirm / alert) ==========
/**
 * 自定义确认弹窗 (替代 window.confirm)
 * @param {string} msg - 提示消息
 * @param {object} opts - { icon, confirmText, cancelText, danger }
 * @returns {Promise<boolean>}
 */
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

/**
 * 自定义提示弹窗 (替代 window.alert)
 * @param {string} msg - 提示消息
 * @param {object} opts - { icon, okText }
 * @returns {Promise<void>}
 */
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

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  // 主题初始化
  initTheme();
  // 桌面版：先初始化 API 地址，再连接 WebSocket
  await initAPI();
  WS.connect();
  setupWSHandlers();
  setupNavigation();
  setupModalDismissal();
  requestNotificationPermission();
  await Promise.all([loadProjects(), loadServers(), loadNodeVersions()]);
  await loadHomeData();
  checkActiveJob();
  // 更新 toolbar 日期
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
  const collapsed = saved === null ? true : saved === 'true';
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
    if (!currentDeployId && activeTask) {
      // 还没拿到 deployId，但有活跃任务，先接收日志
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
    // 接受消息：ID 匹配，或者有活跃任务但还没拿到 ID
    if (data.id !== currentDeployId) {
      if (!(activeTask && !currentDeployId)) return;
      // 拿到真实 ID
      currentDeployId = data.id;
      if (activeTask) activeTask.id = data.id;
    }

    // 连接测试完成
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

    if (data.phase === 'preflight') {
      setStepActive(0);
    } else if (data.phase === 'pulling') {
      setStepDone(0);
      setStepActive(1);
    } else if (data.phase === 'building') {
      setStepDone(0); setStepDone(1);
      setStepActive(2);
    } else if (data.phase === 'uploading') {
      setStepDone(0); setStepDone(1); setStepDone(2);
      setStepActive(3);
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
      // 标记任务已完成
      if (activeTask) activeTask.isRunning = false;
      // 更新关闭按钮文案
      updateLogModalCloseBtn();
      // 如果弹窗已被最小化，自动弹出并发送 toast 通知
      const logModal = document.getElementById('logModal');
      if (!logModal.classList.contains('active')) {
        logModal.classList.add('active');
        showToast(data.status === 'success' ? '✅ 任务完成' : '❌ 任务失败', data.projectName);
      }
      // 解除部署锁并刷新
      if (data.projectName) clearBusy(data.projectName);
      // 发送桌面通知
      const typeText = data.type === 'build-only' ? '构建' : '部署';
      const statusText = data.status === 'success' ? '成功' : '失败';
      const notifyBody = data.status === 'success'
        ? `${data.projectName} ${typeText}完成，耗时 ${data.duration}`
        : `${data.projectName} ${typeText}失败`;
      sendDesktopNotification(`${typeText}${statusText}`, notifyBody, data.status === 'success');
      loadProjects();
    }
  });
}

// ========== Navigation ==========
function setupNavigation() {
  initSidebarState();
  const collapseBtn = document.querySelector('.sidebar-collapse-toggle');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebarCollapse();
    });
  }

  // 项目筛选 chips
  document.querySelectorAll('#sub-dashboard .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#sub-dashboard .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderProjects();
    });
  });

  document.getElementById('searchInput').addEventListener('input', () => renderProjects());

  // 首页初始化
  initHomePage();
}

// ========== 页面切换 ==========
function switchPage(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Support both old .dock-item and new .sidebar-item
  document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(d => d.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const navEl = el || document.querySelector(`.sidebar-item[data-page="${page}"], .dock-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  const main = document.querySelector('.main-content');
  if (main) { main.scrollTop = 0; main.scrollLeft = 0; }
  const activePage = document.getElementById('page-' + page);
  if (activePage) { activePage.scrollTop = 0; activePage.scrollLeft = 0; }
  // 切换到部署面板时加载数据
  if (page === 'deploy') {
    const activeSub = document.querySelector('.sub-tab.active');
    if (activeSub) switchSubTab(activeSub.dataset.sub, activeSub);
  }
  // 切换到周报时初始化
  if (page === 'report') initReport();
  // 切换到设置时加载
  if (page === 'settings') loadSettings();
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
  // 加载对应数据
  if (sub === 'servers') loadServers();
  if (sub === 'history') loadHistory();
}

// ========== 首页 ==========
function initHomePage() {
  // 日期
  const now = new Date();
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  document.getElementById('homeDate').textContent = `今天是 ${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日，${weekdays[now.getDay()]}`;

  // 问候语
  const hour = now.getHours();
  let greeting = '晚上好 🌙';
  if (hour < 6) greeting = '夜深了 🌙';
  else if (hour < 12) greeting = '上午好 ☀️';
  else if (hour < 14) greeting = '中午好 🌤';
  else if (hour < 18) greeting = '下午好 👋';
  document.getElementById('homeGreeting').textContent = greeting;

  loadHomeData();
}

async function loadHomeData() {
  try {
    // 加载历史数据
    const history = await API.get('/api/history');
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(weekStart.getDate() - 7);

    const thisWeek = history.filter(h => {
      const time = new Date(h.timestamp).getTime();
      return time >= weekStart.getTime() && time <= now.getTime();
    });
    const lastWeek = history.filter(h => {
      const time = new Date(h.timestamp).getTime();
      return time >= lastWeekStart.getTime() && time < weekStart.getTime();
    });
    const successCount = thisWeek.filter(h => h.status === 'success').length;
    const failCount = thisWeek.length - successCount;
    const rate = thisWeek.length > 0 ? Math.round(successCount / thisWeek.length * 100) : 0;
    const multiProjectCount = projects.filter(p => p.type === 'multi-module').length;
    const singleProjectCount = projects.length - multiProjectCount;
    const configuredProjectCount = projects.filter(p => getProjectDefaultServerIds(p).length > 0).length;
    const unconfiguredProjectCount = projects.length - configuredProjectCount;
    const weekDeployCount = thisWeek.filter(h => h.type === 'deploy').length;
    const weekBuildCount = thisWeek.length - weekDeployCount;
    const weekDelta = thisWeek.length - lastWeek.length;
    const trendHtml = weekDelta === 0
      ? '<span class="stat-change flat">持平</span>'
      : `<span class="stat-change ${weekDelta > 0 ? 'up' : 'down'}">${weekDelta > 0 ? '+' : ''}${weekDelta}</span>`;

    // 统计卡片
    const statsEl = document.getElementById('homeStats');
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon blue">⌂</div>
        <div class="stat-info">
          <div class="stat-label">管理项目</div>
          <div class="stat-value">${projects.length}</div>
          <div class="stat-sub">多模块 ${multiProjectCount} · 单体 ${singleProjectCount}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">▣</div>
        <div class="stat-info">
          <div class="stat-label">已配置项目</div>
          <div class="stat-value">${configuredProjectCount}</div>
          <div class="stat-sub">已配置 ${configuredProjectCount} · 未配置 ${unconfiguredProjectCount}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">↗</div>
        <div class="stat-info">
          <div class="stat-label">本周操作</div>
          <div class="stat-value">${thisWeek.length}${trendHtml}</div>
          <div class="stat-sub">部署 ${weekDeployCount} · 构建 ${weekBuildCount}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal">◯</div>
        <div class="stat-info">
          <div class="stat-label">成功率</div>
          <div class="stat-value">${rate}%</div>
          <div class="stat-sub">成功 ${successCount} · 失败 ${failCount}</div>
        </div>
      </div>
    `;

    // 最近活动（表格，带状态圆点和事件列）
    const activityEl = document.getElementById('homeActivity');
    const recent = history.slice(0, 8);
    if (recent.length === 0) {
      activityEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">暂无活动记录</div>';
    } else {
      activityEl.innerHTML = `<table class="ha-table">
        <thead><tr><th>时间</th><th>事件</th><th>项目</th><th>类型</th><th>服务器</th><th>状态</th><th>耗时</th></tr></thead>
        <tbody>${recent.map(h => {
          const time = new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
          const typeLabel = h.type === 'deploy' ? '部署' : '构建';
          const eventLabel = h.status === 'success' ? typeLabel + '成功' : (h.status === 'running' ? '构建中' : typeLabel + '失败');
          const dotCls = h.status === 'success' ? 'success' : (h.status === 'running' ? 'running' : 'fail');
          const statusCls = h.status === 'success' ? 'success' : 'fail';
          const statusText = h.status === 'success' ? '成功' : '失败';
          const mods = (h.modules || []).slice(0, 1).join(', ');
          const projectDisplay = h.projectName + (mods ? ' / ' + mods : '');
          return `<tr>
            <td class="ha-time">${time}</td>
            <td><span class="ha-event"><span class="ha-dot ${dotCls}"></span>${eventLabel}</span></td>
            <td class="ha-project">${projectDisplay}</td>
            <td>${typeLabel}</td>
            <td>${h.serverName || '本地'}</td>
            <td><span class="ha-status-badge ${statusCls}">${statusText}</span></td>
            <td>${h.duration || '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    }

    // 快捷操作
    const quickEl = document.getElementById('homeQuick');
    if (quickEl) quickEl.innerHTML = `
      <div class="quick-action-card" onclick="switchPage('deploy', document.querySelector('.sidebar-item[data-page=deploy]'))">
        <div class="qa-icon blue">↗</div>
        <div class="qa-info"><div class="qa-title">快速部署</div></div>
      </div>
      <div class="quick-action-card" onclick="switchPage('deploy', document.querySelector('.sidebar-item[data-page=deploy]'))">
        <div class="qa-icon purple">◇</div>
        <div class="qa-info"><div class="qa-title">构建项目</div></div>
      </div>
      <div class="quick-action-card" onclick="switchPage('report', document.querySelector('.sidebar-item[data-page=report]'))">
        <div class="qa-icon green">▤</div>
        <div class="qa-info"><div class="qa-title">Git 周报</div></div>
      </div>
      <div class="quick-action-card" onclick="switchPage('deploy', document.querySelector('.sidebar-item[data-page=deploy]'));setTimeout(()=>switchSubTab('servers',document.querySelector('.sub-tab[data-sub=servers]')),100)">
        <div class="qa-icon orange">⌁</div>
        <div class="qa-info"><div class="qa-title">服务器管理</div></div>
      </div>
      <div class="quick-action-card" onclick="switchPage('settings', document.querySelector('.sidebar-item[data-page=settings]'))">
        <div class="qa-icon gray">⌘</div>
        <div class="qa-info"><div class="qa-title">系统设置</div></div>
      </div>
    `;
  } catch (e) {
    // 静默失败
  }
}

// ========== Node Versions ==========
async function loadNodeVersions() {
  try {
    const data = await API.get('/api/projects/node-versions/list');
    nodeVersions = data.versions || [];
    currentNodeVersion = data.current || '';
  } catch (e) {
    console.error('加载 Node 版本失败:', e);
  }
}

// ========== Dashboard ==========
async function loadProjects() {
  try {
    projects = await API.get('/api/projects');
    renderProjects();
  } catch (e) {
    console.error('加载项目失败:', e);
  }
}

function renderProjects() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  let filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search) || (p.displayName && p.displayName.toLowerCase().includes(search)));

  if (currentFilter === 'multi') filtered = filtered.filter(p => p.type === 'multi-module');
  else if (currentFilter === 'single') filtered = filtered.filter(p => p.type === 'single');
  else if (currentFilter === 'configured') filtered = filtered.filter(p => p.defaultServerId);
  else if (currentFilter === 'unconfigured') filtered = filtered.filter(p => !p.defaultServerId);

  const grid = document.getElementById('projectGrid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px;grid-column:1/-1">暂无项目，点击右上角「+ 添加项目」开始</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isMulti = p.type === 'multi-module';
    const moduleCount = (p.modules || []).length;
    const nodeLabel = p.nodeVersion ? `<span class="badge-tool">${p.nodeVersion}</span>` : '';
    const isBusy = busyProjects.has(p.name);
    const disabledAttr = isBusy ? 'disabled' : '';
    const last = lastDeployCache[p.name];
    let lastDeployHtml = '<div class="card-last-deploy">○ 暂无构建/部署记录</div>';
    if (last) {
      const icon = last.status === 'success' ? '✅' : '❌';
      const ago = timeAgo(last.timestamp);
      const mods = (last.modules || []).join(', ');
      const typeLabel = last.type === 'deploy' ? '部署' : '构建';
      const info = last.type === 'deploy' ? `${typeLabel} → ${last.serverName} · ${mods}` : `${typeLabel} · ${mods}`;
      lastDeployHtml = `<div class="card-last-deploy ${last.status}">${icon} ${ago} · ${info} · ${last.duration}</div>`;
    }
    return `
    <div class="project-card ${isBusy ? 'card-busy' : ''}" data-project="${p.name}" onclick="openDeployModal('${p.name}')">
      <div class="card-top">
        <div class="card-name">${isMulti ? '📦' : '📄'} ${p.displayName || p.name}</div>
        <span class="card-badge ${isMulti ? 'badge-multi' : 'badge-single'}">${isMulti ? '多模块' : '单体'}</span>
      </div>
      <div class="card-meta">
        <span><span class="badge-tool">${p.tool}</span> ${nodeLabel} ${isMulti ? moduleCount + ' 个模块' : ''}</span>
        <span>构建: ${p.buildCommand || 'npm run build'}</span>
      </div>
      ${isMulti ? `<div class="card-modules">${(p.modules || []).slice(0, 5).map(m => `<span class="module-tag">${m.name}</span>`).join('')}${moduleCount > 5 ? `<span class="module-more">+${moduleCount - 5}</span>` : ''}</div>` : ''}
      <div class="card-status ${getProjectDefaultServerIds(p).length > 0 ? 'status-configured' : 'status-unconfigured'}">
        ${getProjectDefaultServerIds(p).length > 0 ? `● 已配置 ${getProjectDefaultServerIds(p).length} 台服务器` : '○ 未配置服务器'}
      </div>
      ${lastDeployHtml}
      <div style="display:flex;gap:8px;margin-top:auto">
        ${isBusy ? `
        <button class="btn-deploy-card btn-progress-card" style="flex:1" onclick="event.stopPropagation();reopenLogModal()">⏳ 查看进度...</button>
        ` : `
        <button class="btn-deploy-card btn-build-card" style="flex:1" onclick="event.stopPropagation();openBuildModal('${p.name}')" ${disabledAttr}>🔨 构建</button>
        <button class="btn-deploy-card" style="flex:1" onclick="event.stopPropagation();openDeployModal('${p.name}')" ${disabledAttr}>🚀 部署</button>
        <button class="btn-deploy-card btn-quick" style="flex-shrink:0;width:40px;height:40px" onclick="event.stopPropagation();quickRepeat('${p.name}')" ${disabledAttr || !last ? 'disabled' : ''} title="快速复用上次操作">⚡</button>
        <button class="btn-icon" style="flex-shrink:0;width:40px;height:40px" onclick="event.stopPropagation();openProjectConfig('${p.name}')" title="默认配置">⚙</button>
        <button class="btn-icon danger" style="flex-shrink:0;width:40px;height:40px" onclick="event.stopPropagation();removeProject('${p.name}')" title="移除项目">🗑</button>
        `}
      </div>
    </div>`;
  }).join('');

  // 异步加载每个项目的最近部署信息
  loadLastDeployInfos(filtered);
}

// 加载项目最近部署信息（批量异步，不阻塞渲染）
async function loadLastDeployInfos(projectList) {
  const promises = projectList.map(async (p) => {
    try {
      const data = await API.get(`/api/deploy/last/${p.name}`);
      if (data) {
        lastDeployCache[p.name] = data;
      }
    } catch (e) { /* ignore */ }
  });
  await Promise.all(promises);
  // 数据加载完毕后更新卡片上的部署状态
  document.querySelectorAll('.project-card[data-project]').forEach(card => {
    const pName = card.dataset.project;
    const last = lastDeployCache[pName];
    const el = card.querySelector('.card-last-deploy');
    const btn = card.querySelector('.btn-quick');
    if (last && el) {
      const icon = last.status === 'success' ? '✅' : '❌';
      const ago = timeAgo(last.timestamp);
      const mods = (last.modules || []).join(', ');
      const typeLabel = last.type === 'deploy' ? '部署' : '构建';
      const info = last.type === 'deploy' ? `${typeLabel} → ${last.serverName} · ${mods}` : `${typeLabel} · ${mods}`;
      el.className = `card-last-deploy ${last.status}`;
      el.textContent = `${icon} ${ago} · ${info} · ${last.duration}`;
    }
    if (btn) btn.disabled = !last;
  });
}

// 时间友好化显示
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

// ========== 防重复部署锁 ==========
function setBusy(projectName) {
  busyProjects.add(projectName);
  renderProjects();
}
function clearBusy(projectName) {
  busyProjects.delete(projectName);
  // 清除缓存以强制刷新最新部署信息
  delete lastDeployCache[projectName];
}

// ========== 一键快速复用（支持构建/部署） ==========
let quickRepeatState = { projectName: '', selectedRecord: null };

async function quickRepeat(projectName) {
  if (busyProjects.has(projectName)) return;
  quickRepeatState = { projectName, selectedRecord: null };
  document.getElementById('quickSubtitle').textContent = projectName;
  document.getElementById('quickConfirmBtn').disabled = true;
  document.getElementById('quickHistoryList').innerHTML =
    '<div style="text-align:center;color:var(--text-muted);padding:32px">加载中...</div>';
  // 重置筛选按钮为「全部」
  document.querySelectorAll('#quickFilters .qf-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  document.getElementById('quickModal').classList.add('active');

  try {
    const records = await API.get(`/api/deploy/recent/${projectName}?limit=10`);
    if (!records || records.length === 0) {
      document.getElementById('quickHistoryList').innerHTML =
        '<div style="text-align:center;color:var(--text-muted);padding:32px">暂无成功的历史记录</div>';
      return;
    }
    quickRepeatState.records = records; // 保存全量数据用于筛选
    renderQuickHistoryList(records);
  } catch (e) {
    document.getElementById('quickHistoryList').innerHTML =
      `<div style="text-align:center;color:var(--text-muted);padding:32px">加载失败: ${e.message}</div>`;
  }
}

function renderQuickHistoryList(records) {
  const list = document.getElementById('quickHistoryList');
  list.innerHTML = records.map((r, i) => {
    const isDeploy = r.type === 'deploy';
    const typeLabel = isDeploy ? '部署' : '构建';
    const typeCls = isDeploy ? 'qh-type-deploy' : 'qh-type-build';
    const mods = (r.modules || []).join(', ');
    const detail = isDeploy
      ? `${r.serverName} · ${r.remotePath} · ${mods}`
      : mods;
    const time = new Date(r.timestamp).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="quick-history-item" data-index="${i}" onclick="selectQuickRecord(${i})">
        <div class="qh-radio"></div>
        <div class="qh-info">
          <div class="qh-title">
            <span class="qh-type ${typeCls}">${typeLabel}</span>
            ${mods}
          </div>
          <div class="qh-detail">${detail}</div>
        </div>
        <div class="qh-time">
          <div>${time}</div>
          <div class="qh-duration">${r.duration}</div>
        </div>
      </div>`;
  }).join('');

  // 缓存当前展示的 records（用于 selectQuickRecord）
  quickRepeatState.filteredRecords = records;
}

function selectQuickRecord(index) {
  document.querySelectorAll('.quick-history-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
  quickRepeatState.selectedRecord = quickRepeatState.filteredRecords[index];
  document.getElementById('quickConfirmBtn').disabled = false;
}

function filterQuickHistory(type) {
  // 切换按钮激活态
  document.querySelectorAll('#quickFilters .qf-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === type);
  });
  // 筛选并重新渲染
  if (!quickRepeatState.records) return;
  const filtered = type === 'all'
    ? quickRepeatState.records
    : quickRepeatState.records.filter(r => r.type === type);
  if (filtered.length === 0) {
    document.getElementById('quickHistoryList').innerHTML =
      '<div style="text-align:center;color:var(--text-muted);padding:32px">无匹配记录</div>';
    quickRepeatState.selectedRecord = null;
    document.getElementById('quickConfirmBtn').disabled = true;
    return;
  }
  renderQuickHistoryList(filtered);
  // 重置选中状态
  quickRepeatState.selectedRecord = null;
  document.getElementById('quickConfirmBtn').disabled = true;
}

async function confirmQuickRepeat() {
  const { projectName, selectedRecord: record } = quickRepeatState;
  if (!record) return;

  closeModal('quickModal');
  setBusy(projectName);
  activeTask = { id: null, projectName, isRunning: true };

  const isDeploy = record.type === 'deploy';
  const typeLabel = isDeploy ? '部署' : '构建';
  const mods = (record.modules || []).join(', ');

  // 初始化日志弹窗
  document.getElementById('logTitle').textContent = `${typeLabel}进度`;
  document.getElementById('logSubtitle').textContent = `${projectName} · ${mods}`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '0%';
  const steps = isDeploy
    ? ['预检', '拉取代码', '构建中', '上传中', '完成']
    : ['拉取代码', '构建中'];
  document.getElementById('progressSteps').innerHTML = steps.map((s, i) =>
    `<div class="step${i === 0 ? ' active' : ''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');
  document.getElementById('logModal').classList.add('active');

  try {
    const apiUrl = isDeploy ? '/api/deploy/start' : '/api/deploy/build';
    const body = {
      projectName,
      modules: record.modules.includes('整体构建') ? [] : record.modules,
      nodeVersion: '',
    };
    if (isDeploy) {
      // 优先使用 serverIds 数组（支持多服务器复用），兼容旧记录用 serverId
      body.serverIds = record.serverIds && record.serverIds.length > 0
        ? record.serverIds
        : (record.serverId ? [record.serverId] : []);
      body.remotePath = record.remotePath;
    }
    const data = await API.post(apiUrl, body);
    currentDeployId = data.id;
    if (activeTask) activeTask.id = data.id;
    updateLogModalCloseBtn();
  } catch (e) {
    clearBusy(projectName);
    showAlert(`快速${typeLabel}失败: ` + e.message, { icon: '❌' });
  }
}

async function removeProject(name) {
  if (!await showConfirm(`确定移除项目「${name}」？（仅从面板中移除，不会删除源码）`, { icon: '🗑️', danger: true, confirmText: '移除' })) return;
  try {
    await API.del(`/api/projects/${name}`);
    await loadProjects();
  } catch (e) {
    showAlert('移除失败: ' + e.message, { icon: '❌' });
  }
}

// ========== Project Config Modal (默认配置) ==========
let configProjectName = '';
let configCheckedServers = new Set();

function getProjectDefaultServerIds(project) {
  // 兼容旧版单值 defaultServerId 和新版数组 defaultServerIds
  if (Array.isArray(project.defaultServerIds) && project.defaultServerIds.length > 0) {
    return project.defaultServerIds;
  }
  return project.defaultServerId ? [project.defaultServerId] : [];
}

function openProjectConfig(name) {
  const project = projects.find(p => p.name === name);
  if (!project) return;
  configProjectName = name;
  configCheckedServers.clear();

  document.getElementById('configProjectName').textContent = `项目: ${name}`;
  document.getElementById('configDisplayName').value = project.displayName || '';

  // Node 版本下拉
  const nodeSelect = document.getElementById('configNodeVersion');
  nodeSelect.innerHTML = `<option value="">系统默认 (${currentNodeVersion})</option>`
    + nodeVersions.map(v => `<option value="${v}" ${v === (project.nodeVersion || '') ? 'selected' : ''}>${v}</option>`).join('');

  // 服务器多选列表
  const defaultIds = getProjectDefaultServerIds(project);
  const listEl = document.getElementById('configServerList');
  if (!servers.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">暂无服务器</div>';
  } else {
    listEl.innerHTML = servers.map(s => {
      const checked = defaultIds.includes(s.id);
      if (checked) configCheckedServers.add(s.id);
      return `<div class="server-check-item ${checked ? 'checked' : ''}" data-sid="${s.id}" onclick="toggleConfigServer('${s.id}', this)">
        <span class="srv-check">${checked ? '✓' : ''}</span>
        <span>${s.name} (${s.host})</span>
      </div>`;
    }).join('');
  }

  document.getElementById('projectConfigModal').classList.add('active');
}

function toggleConfigServer(sid, el) {
  if (configCheckedServers.has(sid)) {
    configCheckedServers.delete(sid);
    el.classList.remove('checked');
    el.querySelector('.srv-check').textContent = '';
  } else {
    configCheckedServers.add(sid);
    el.classList.add('checked');
    el.querySelector('.srv-check').textContent = '✓';
  }
}

async function saveProjectConfig() {
  const nodeVersion = document.getElementById('configNodeVersion').value;
  const displayName = document.getElementById('configDisplayName').value.trim();
  const defaultServerIds = [...configCheckedServers];
  const defaultServerId = defaultServerIds[0] || '';
  try {
    await API.put(`/api/projects/${configProjectName}`, { nodeVersion, defaultServerId, defaultServerIds, displayName });
    // 同步更新本地数据
    const p = projects.find(p => p.name === configProjectName);
    if (p) {
      p.nodeVersion = nodeVersion;
      p.defaultServerId = defaultServerId;
      p.defaultServerIds = defaultServerIds;
      p.displayName = displayName;
    }
    closeModal('projectConfigModal');
    renderProjects();
    showToast('✅ 配置已保存', `${configProjectName} 的默认配置已更新`);
  } catch (e) {
    showAlert('保存失败: ' + e.message, { icon: '❌' });
  }
}

// ========== Add Project Modal ==========
async function showAddProject() {
  checkedAvailableProjects.clear();
  checkedBrowseProjects.clear();
  currentAddMode = 'scan';
  try {
    availableProjects = await API.get('/api/projects/available');
  } catch (e) {
    showAlert('获取可用项目失败: ' + e.message, { icon: '❌' });
    return;
  }
  renderAvailableProjects();
  // 重置 tab 状态
  document.getElementById('addPanelScan').style.display = '';
  document.getElementById('addPanelBrowse').style.display = 'none';
  const btns = document.querySelectorAll('#addProjectModal .seg-btn');
  btns.forEach((b, i) => { b.classList.toggle('active', i === 0); });
  document.getElementById('addProjectModal').classList.add('active');
}

// ========== 模式切换 ==========
let currentAddMode = 'scan';
let checkedBrowseProjects = new Set();

function switchAddMode(mode, btn) {
  currentAddMode = mode;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('addPanelScan').style.display = mode === 'scan' ? '' : 'none';
  document.getElementById('addPanelBrowse').style.display = mode === 'browse' ? '' : 'none';
  if (mode === 'browse') {
    browseTo(); // 加载根目录
  }
  updateAddSubmitBtn();
}

// ========== 自动扫描面板 ==========
function renderAvailableProjects(filter = '') {
  const filtered = availableProjects.filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  document.getElementById('availableProjectGrid').innerHTML = filtered.length
    ? filtered.map(p => `
      <div class="module-item ${checkedAvailableProjects.has(p.path) ? 'checked' : ''}" onclick="toggleAvailableProject('${p.path}')">
        <div class="checkbox">${checkedAvailableProjects.has(p.path) ? '✓' : ''}</div>
        <span>${p.name}</span>
      </div>`).join('')
    : '<div style="text-align:center;color:var(--text-muted);padding:24px;grid-column:1/-1">所有项目已添加</div>';
  document.getElementById('selectedProjectCount').textContent = `已选 ${checkedAvailableProjects.size} 个`;
  updateAddSubmitBtn();
}

function toggleAvailableProject(path) {
  checkedAvailableProjects.has(path) ? checkedAvailableProjects.delete(path) : checkedAvailableProjects.add(path);
  renderAvailableProjects(document.getElementById('availableProjectSearch').value);
}

function toggleAllAvailable(check) {
  if (check) availableProjects.forEach(p => checkedAvailableProjects.add(p.path));
  else checkedAvailableProjects.clear();
  renderAvailableProjects(document.getElementById('availableProjectSearch').value);
}

function filterAvailableProjects() {
  renderAvailableProjects(document.getElementById('availableProjectSearch').value);
}

// ========== 手动浏览面板 ==========
async function browseTo(dir) {
  try {
    const data = await API.get('/api/projects/browse' + (dir ? `?dir=${encodeURIComponent(dir)}` : ''));
    renderBrowseBreadcrumb(data.currentDir, data.root);
    renderBrowseList(data.entries);
  } catch (e) {
    showAlert('浏览目录失败: ' + e.message, { icon: '❌' });
  }
}

function renderBrowseBreadcrumb(currentDir, root) {
  const rel = currentDir.replace(root, '').replace(/^\//, '');
  const parts = rel ? rel.split('/') : [];
  let html = `<button onclick="browseTo('${root}')">📁 project</button>`;
  let accum = root;
  parts.forEach(p => {
    accum = accum + '/' + p;
    html += `<span>/</span><button onclick="browseTo('${accum}')">${p}</button>`;
  });
  document.getElementById('addBrowseBreadcrumb').innerHTML = html;
}

function renderBrowseList(entries) {
  if (!entries.length) {
    document.getElementById('addBrowseList').innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px">此目录下没有子文件夹</div>';
    return;
  }
  document.getElementById('addBrowseList').innerHTML = entries.map(e => {
    if (e.isProject) {
      // 是前端项目，可以选择添加
      const checked = checkedBrowseProjects.has(e.path);
      const disabled = e.alreadyAdded;
      return `<div class="browser-item ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
                   onclick="${disabled ? '' : `toggleBrowseProject('${e.path}')`}"
                   style="cursor:${disabled ? 'not-allowed' : 'pointer'}">
        <span style="display:flex;align-items:center;gap:8px">
          ${disabled ? '✅' : checked ? '<span style="color:var(--accent)">☑</span>' : '☐'}
          <span style="color:var(--accent)">📦</span> ${e.name}
        </span>
        <span style="font-size:11px;color:var(--text-muted)">${disabled ? '已添加' : '前端项目'}</span>
      </div>`;
    } else if (e.hasSubDirs) {
      // 普通文件夹，可以进入浏览
      return `<div class="browser-item" onclick="browseTo('${e.path}')" style="cursor:pointer">
        <span style="display:flex;align-items:center;gap:8px">📁 ${e.name}</span>
        <span style="font-size:11px;color:var(--text-muted)">→</span>
      </div>`;
    } else {
      // 既不是项目也没有子目录
      return `<div class="browser-item disabled" style="cursor:default;opacity:.4">
        <span style="display:flex;align-items:center;gap:8px">📁 ${e.name}</span>
        <span style="font-size:11px;color:var(--text-muted)">空</span>
      </div>`;
    }
  }).join('');
}

function toggleBrowseProject(p) {
  checkedBrowseProjects.has(p) ? checkedBrowseProjects.delete(p) : checkedBrowseProjects.add(p);
  document.getElementById('browseSelectedCount').textContent = `已选 ${checkedBrowseProjects.size} 个`;
  // 刷新列表中的选中状态
  document.querySelectorAll('#addBrowseList .browser-item:not(.disabled)').forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    const match = onclick.match(/toggleBrowseProject\('(.+?)'\)/);
    if (match) {
      el.classList.toggle('selected', checkedBrowseProjects.has(match[1]));
    }
  });
  updateAddSubmitBtn();
}

function updateAddSubmitBtn() {
  const total = currentAddMode === 'scan' ? checkedAvailableProjects.size : checkedBrowseProjects.size;
  document.getElementById('addProjectSubmitBtn').textContent = total > 0 ? `添加 ${total} 个项目` : '添加选中项目';
}

// ========== 统一提交 ==========
async function addSelectedProjects() {
  const paths = currentAddMode === 'scan' ? [...checkedAvailableProjects] : [...checkedBrowseProjects];
  if (paths.length === 0) { await showAlert('请至少选择一个项目', { icon: '⚠️' }); return; }
  try {
    const result = await API.post('/api/projects/batch', { paths });
    closeModal('addProjectModal');
    await loadProjects();
    const msg = [`成功添加 ${result.added.length} 个项目`];
    if (result.errors.length) msg.push(`${result.errors.length} 个失败`);
    showAlert(msg.join('，'), { icon: '✅' });
  } catch (e) {
    showAlert('添加失败: ' + e.message, { icon: '❌' });
  }
}

// ========== Module Select Modal ==========
// 每个弹窗维护独立状态
const modalState = {
  build: { checkedModules: new Set(), moduleFilter: 'all' },
  deploy: { checkedModules: new Set(), moduleFilter: 'all' },
};
let activeCtx = 'deploy'; // 当前活跃的弹窗上下文

function getFavorites(projectName) {
  try { return JSON.parse(localStorage.getItem(`fav_${projectName}`) || '[]'); } catch { return []; }
}
function saveFavorites(projectName, favs) {
  localStorage.setItem(`fav_${projectName}`, JSON.stringify(favs));
}
function getLastSelected(projectName) {
  try { return JSON.parse(localStorage.getItem(`last_${projectName}`) || '[]'); } catch { return []; }
}
function saveLastSelected(projectName, selected) {
  localStorage.setItem(`last_${projectName}`, JSON.stringify(selected));
}

function toggleFavorite(name, e, ctx) {
  if (e) e.stopPropagation();
  const favs = getFavorites(currentProject.name);
  const idx = favs.indexOf(name);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(name);
  saveFavorites(currentProject.name, favs);
  const searchId = ctx === 'build' ? 'buildModuleSearch' : 'deployModuleSearch';
  renderModules(document.getElementById(searchId).value, ctx);
}

function setModuleFilter(mode, ctx) {
  modalState[ctx].moduleFilter = mode;
  document.getElementById(`${ctx}FilterAll`).classList.toggle('active', mode === 'all');
  document.getElementById(`${ctx}FilterFav`).classList.toggle('active', mode === 'fav');
  const searchId = ctx === 'build' ? 'buildModuleSearch' : 'deployModuleSearch';
  renderModules(document.getElementById(searchId).value, ctx);
}

function initModalState(ctx, name) {
  currentProject = projects.find(p => p.name === name);
  if (!currentProject) return false;
  const state = modalState[ctx];
  state.checkedModules.clear();
  state.moduleFilter = 'all';
  activeCtx = ctx;

  const prefix = ctx === 'build' ? 'build' : 'deploy';
  document.getElementById(`${prefix}ModalTitle`).textContent = currentProject.name;
  const isMulti = currentProject.type === 'multi-module';
  document.getElementById(`${prefix}ModalSubtitle`).textContent = isMulti
    ? `多模块项目 · ${(currentProject.modules || []).length} 个可部署模块`
    : `单体项目 · ${currentProject.tool}`;

  document.getElementById(`${prefix}SingleView`).style.display = isMulti ? 'none' : 'block';
  document.getElementById(`${prefix}MultiView`).style.display = isMulti ? 'block' : 'none';

  if (isMulti) {
    const last = getLastSelected(currentProject.name);
    last.forEach(m => state.checkedModules.add(m));
    document.getElementById(`${prefix}FilterAll`).classList.add('active');
    document.getElementById(`${prefix}FilterFav`).classList.remove('active');
    renderModules('', ctx);
  }

  // Node 版本下拉
  const nodeSelect = document.getElementById(`${prefix}NodeVersion`);
  const projectNode = currentProject.nodeVersion || '';
  nodeSelect.innerHTML = `<option value="">系统默认 (${currentNodeVersion})</option>`
    + nodeVersions.map(v => `<option value="${v}" ${v === projectNode ? 'selected' : ''}>${v}</option>`).join('');

  return true;
}

function openBuildModal(name) {
  if (!initModalState('build', name)) return;
  document.getElementById('buildModal').classList.add('active');
  loadGitLog(name, 'buildGitLog');
}

function openDeployModal(name) {
  if (!initModalState('deploy', name)) return;
  checkedServers.clear();

  // 渲染多选服务器列表
  const listEl = document.getElementById('targetServerList');
  if (!servers.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">请先添加服务器</div>';
  } else {
    const defaultIds = getProjectDefaultServerIds(currentProject);
    listEl.innerHTML = servers.map(s => {
      const isDefault = defaultIds.includes(s.id);
      if (isDefault) checkedServers.add(s.id);
      return `<div class="server-check-item ${isDefault ? 'checked' : ''}" data-sid="${s.id}" onclick="toggleServerCheck('${s.id}', this)">
        <span class="srv-check">${isDefault ? '✓' : ''}</span>
        <span>${s.name} (${s.host})</span>
      </div>`;
    }).join('');
  }

  // 初始化发布目录下拉（基于第一台选中的服务器）
  populateDeployPathsDropdown();
  document.getElementById('deployModal').classList.add('active');
  loadGitLog(name, 'deployGitLog');
}

let checkedServers = new Set();

function toggleServerCheck(sid, el) {
  if (checkedServers.has(sid)) {
    checkedServers.delete(sid);
    el.classList.remove('checked');
    el.querySelector('.srv-check').textContent = '';
  } else {
    checkedServers.add(sid);
    el.classList.add('checked');
    el.querySelector('.srv-check').textContent = '✓';
  }
  populateDeployPathsDropdown();
}

function getFirstCheckedServerId() {
  return checkedServers.size > 0 ? [...checkedServers][0] : null;
}

function populateDeployPathsDropdown() {
  const serverId = getFirstCheckedServerId();
  const server = servers.find(s => s.id === serverId);
  const remotePathSelect = document.getElementById('remotePath');

  if (!server) {
    remotePathSelect.innerHTML = '<option value="/">/ (默认)</option>';
    return;
  }

  const paths = Array.isArray(server.deployPaths) && server.deployPaths.length > 0
    ? server.deployPaths
    : [server.defaultRemotePath || '/'];

  remotePathSelect.innerHTML = paths.map((p, i) =>
    `<option value="${p}">${p}${i === 0 ? ' (默认)' : ''}</option>`
  ).join('');
}

// ========== Quick Connection Test (部署弹窗内快速测试) ==========
async function quickTestServers() {
  if (checkedServers.size === 0) {
    await showAlert('请先选择至少一个服务器', { icon: '⚠️' });
    return;
  }

  const btn = document.getElementById('btnQuickTest');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span> 测试中...';

  const serverIds = [...checkedServers];

  // 先将所有选中的服务器显示为「测试中」状态
  serverIds.forEach(sid => {
    const el = document.querySelector(`#targetServerList .server-check-item[data-sid="${sid}"]`);
    if (!el) return;
    let badge = el.querySelector('.conn-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'conn-badge';
      el.appendChild(badge);
    }
    badge.className = 'conn-badge conn-testing';
    badge.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;display:inline-block;vertical-align:middle"></span>';
  });

  // 并发测试所有服务器
  const results = await Promise.allSettled(
    serverIds.map(async sid => {
      try {
        const result = await API.post(`/api/servers/${sid}/quick-test`);
        return { sid, ...result };
      } catch (e) {
        return { sid, success: false, error: e.message };
      }
    })
  );

  // 显示结果
  let allOk = true;
  results.forEach(r => {
    const data = r.status === 'fulfilled' ? r.value : { sid: null, success: false, error: '请求失败' };
    if (!data.sid) return;
    const el = document.querySelector(`#targetServerList .server-check-item[data-sid="${data.sid}"]`);
    if (!el) return;
    const badge = el.querySelector('.conn-badge');
    if (!badge) return;

    if (data.success) {
      badge.className = 'conn-badge conn-ok';
      badge.textContent = `✓ ${data.duration}ms`;
    } else {
      allOk = false;
      badge.className = 'conn-badge conn-fail';
      badge.textContent = '✗ 失败';
      badge.title = data.error || '连接失败';
    }
  });

  btn.disabled = false;
  btn.innerHTML = allOk ? '✅ 全部连通' : '⚠️ 部分失败';

  // 3 秒后恢复按钮文字
  setTimeout(() => {
    btn.innerHTML = '🔗 测试连接';
  }, 3000);
}

function renderModules(filter = '', ctx = activeCtx) {
  const state = modalState[ctx];
  const favs = getFavorites(currentProject.name);
  let modules = (currentProject.modules || [])
    .filter(m => !filter || m.name.toLowerCase().includes(filter.toLowerCase()));

  if (state.moduleFilter === 'fav') {
    modules = modules.filter(m => favs.includes(m.name));
  }

  const favModules = modules.filter(m => favs.includes(m.name));
  const otherModules = modules.filter(m => !favs.includes(m.name));

  let html = '';
  if (favModules.length > 0 && state.moduleFilter === 'all') {
    html += favModules.map(m => renderModuleItem(m, true, ctx, state.checkedModules)).join('');
    if (otherModules.length > 0) {
      html += `<div class="module-divider"><span>其他模块</span></div>`;
    }
  }
  html += otherModules.map(m => renderModuleItem(m, favs.includes(m.name), ctx, state.checkedModules)).join('');

  if (state.moduleFilter === 'fav') {
    html = favModules.map(m => renderModuleItem(m, true, ctx, state.checkedModules)).join('');
    if (favModules.length === 0) {
      html = '<div style="text-align:center;color:var(--text-muted);padding:24px;grid-column:1/-1">暂无常用模块，点击模块右上角 ☆ 添加</div>';
    }
  }

  document.getElementById(`${ctx}ModuleGrid`).innerHTML = html;
  document.getElementById(`${ctx}SelectedCount`).textContent = `已选 ${state.checkedModules.size} 个`;
}

function renderModuleItem(m, isFav, ctx, checked) {
  const isChecked = checked.has(m.name);
  return `
    <div class="module-item ${isChecked ? 'checked' : ''}" onclick="toggleModule('${m.name}','${ctx}')">
      <div class="checkbox">${isChecked ? '✓' : ''}</div>
      <span>${m.name}</span>
      <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${m.name}', event, '${ctx}')" title="${isFav ? '取消常用' : '设为常用'}">${isFav ? '★' : '☆'}</button>
    </div>`;
}

function toggleModule(name, ctx = activeCtx) {
  const checked = modalState[ctx].checkedModules;
  checked.has(name) ? checked.delete(name) : checked.add(name);
  const searchId = ctx === 'build' ? 'buildModuleSearch' : 'deployModuleSearch';
  renderModules(document.getElementById(searchId).value, ctx);
}

function toggleAll(check, ctx = activeCtx) {
  const state = modalState[ctx];
  const favs = getFavorites(currentProject.name);
  if (state.moduleFilter === 'fav') {
    if (check) favs.forEach(name => state.checkedModules.add(name));
    else favs.forEach(name => state.checkedModules.delete(name));
  } else {
    if (check) (currentProject.modules || []).forEach(m => state.checkedModules.add(m.name));
    else state.checkedModules.clear();
  }
  const searchId = ctx === 'build' ? 'buildModuleSearch' : 'deployModuleSearch';
  renderModules(document.getElementById(searchId).value, ctx);
}

function filterModules(ctx = activeCtx) {
  const searchId = ctx === 'build' ? 'buildModuleSearch' : 'deployModuleSearch';
  renderModules(document.getElementById(searchId).value, ctx);
}

// ========== Deploy / Build ==========
async function startBuildOnly() {
  const state = modalState.build;
  if (currentProject.type === 'multi-module' && state.checkedModules.size === 0) {
    await showAlert('请至少选择一个模块', { icon: '⚠️' }); return;
  }
  saveLastSelected(currentProject.name, [...state.checkedModules]);
  
  const selectedNodeVersion = document.getElementById('buildNodeVersion').value;
  // 自动记住 Node 版本到项目配置
  if (selectedNodeVersion !== (currentProject.nodeVersion || '')) {
    currentProject.nodeVersion = selectedNodeVersion;
    API.put(`/api/projects/${currentProject.name}`, { nodeVersion: selectedNodeVersion }).catch(() => {});
  }
  
  setBusy(currentProject.name);
  activeTask = { id: null, projectName: currentProject.name, isRunning: true };
  closeModal('buildModal');
  showLogModal(true);
  try {
    const data = await API.post('/api/deploy/build', {
      projectName: currentProject.name,
      modules: [...state.checkedModules],
      nodeVersion: selectedNodeVersion,
    });
    currentDeployId = data.id;
    if (activeTask) activeTask.id = data.id;
    updateLogModalCloseBtn();
  } catch (e) {
    appendLog('请求失败: ' + e.message, 'error');
  }
}

async function startDeploy() {
  const state = modalState.deploy;
  if (currentProject.type === 'multi-module' && state.checkedModules.size === 0) {
    await showAlert('请至少选择一个模块', { icon: '⚠️' }); return;
  }
  if (checkedServers.size === 0) { await showAlert('请至少选择一个目标服务器', { icon: '⚠️' }); return; }

  const serverIds = [...checkedServers];
  const serverNames = serverIds.map(id => servers.find(s => s.id === id)?.name || id).join('、');

  if (serverIds.length > 1) {
    if (!await showConfirm(`确认同时部署到 ${serverIds.length} 台服务器？\n${serverNames}`, { icon: '🚀', confirmText: '全部部署' })) return;
  }

  saveLastSelected(currentProject.name, [...state.checkedModules]);
  
  const selectedNodeVersion = document.getElementById('deployNodeVersion').value;
  // 自动记住 Node 版本到项目配置
  if (selectedNodeVersion !== (currentProject.nodeVersion || '')) {
    currentProject.nodeVersion = selectedNodeVersion;
    API.put(`/api/projects/${currentProject.name}`, { nodeVersion: selectedNodeVersion }).catch(() => {});
  }
  
  setBusy(currentProject.name);
  activeTask = { id: null, projectName: currentProject.name, isRunning: true };
  closeModal('deployModal');
  showLogModal(false);
  try {
    const data = await API.post('/api/deploy/start', {
      projectName: currentProject.name,
      modules: [...state.checkedModules],
      serverIds,
      serverId: serverIds[0],
      remotePath: document.getElementById('remotePath').value,
      nodeVersion: selectedNodeVersion,
    });
    currentDeployId = data.id;
    if (activeTask) activeTask.id = data.id;
    updateLogModalCloseBtn();
  } catch (e) {
    appendLog('请求失败: ' + e.message, 'error');
  }
}

// ========== Remote File Browser ==========
let browserCurrentDir = '/';

async function openRemoteBrowser() {
  const serverId = getFirstCheckedServerId();
  if (!serverId) { await showAlert('请先选择至少一个目标服务器', { icon: '⚠️' }); return; }
  
  const server = servers.find(s => s.id === serverId);
  document.getElementById('browserServerInfo').textContent = server ? `${server.name} (${server.host})` : '';

  // 使用服务器配置的「默认打开目录」作为起始路径（类似 FileZilla 行为）
  const startPath = server?.defaultRemotePath || '/';
  document.getElementById('remoteBrowserModal').classList.add('active');
  browseRemoteDir(startPath);
}

async function browseRemoteDir(dirPath) {
  const serverId = getFirstCheckedServerId();
  browserCurrentDir = dirPath;
  
  document.getElementById('browserCurrentPath').textContent = dirPath;
  document.getElementById('browserList').innerHTML = '<div class="browser-loading"><span class="spinner"></span>正在连接服务器...</div>';
  
  renderBreadcrumb(dirPath);
  
  try {
    const data = await API.post(`/api/servers/${serverId}/browse`, { path: dirPath });
    // 后端可能自动回退到了存在的目录
    browserCurrentDir = data.path;
    document.getElementById('browserCurrentPath').textContent = data.path;
    renderBreadcrumb(data.path);
    
    let fallbackHtml = '';
    if (data.fallback) {
      fallbackHtml = `<div style="padding:8px 14px;background:rgba(255,193,7,.1);border:1px solid rgba(255,193,7,.3);border-radius:6px;margin-bottom:8px;font-size:12px;color:#ffc107">⚠ ${data.fallback}</div>`;
    }
    document.getElementById('browserList').innerHTML = fallbackHtml;
    const listEl = document.getElementById('browserList');
    listEl.innerHTML = fallbackHtml + renderBrowserListHtml(data.items, data.path);
  } catch (e) {
    document.getElementById('browserList').innerHTML = 
      `<div style="text-align:center;color:var(--error);padding:30px">
        <div style="font-size:24px;margin-bottom:8px">⚠</div>
        <div>${e.message || '目录读取失败'}</div>
        <button class="btn-text" onclick="browseRemoteDir('/')" style="margin-top:12px;color:var(--accent)">返回根目录</button>
      </div>`;
  }
}

function renderBreadcrumb(dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let html = `<button onclick="browseRemoteDir('/')">/</button>`;
  let accumulated = '';
  for (const part of parts) {
    accumulated += '/' + part;
    const fullPath = accumulated;
    html += `<span>/</span><button onclick="browseRemoteDir('${fullPath}')">${part}</button>`;
  }
  document.getElementById('browserBreadcrumb').innerHTML = html;
}

function renderBrowserListHtml(items, currentPath) {
  let html = '';
  
  if (currentPath !== '/') {
    const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    html += `<div class="browser-item parent-dir" onclick="browseRemoteDir('${parentPath}')">
      <span class="item-icon">⬆</span>
      <span class="item-name">..</span>
      <span class="item-size"></span>
      <span class="item-time">返回上级</span>
    </div>`;
  }
  
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    
    const icon = item.isDir ? '📁' : '📄';
    const size = item.isDir ? '&lt;DIR&gt;' : formatFileSize(item.size);
    const time = new Date(item.mtime).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    
    if (item.isDir) {
      html += `<div class="browser-item is-dir" onclick="browseRemoteDir('${fullPath}')">
        <span class="item-icon">${icon}</span>
        <span class="item-name">${item.name}</span>
        <span class="item-size">${size}</span>
        <span class="item-time">${time}</span>
      </div>`;
    } else {
      html += `<div class="browser-item">
        <span class="item-icon">${icon}</span>
        <span class="item-name">${item.name}</span>
        <span class="item-size">${size}</span>
        <span class="item-time">${time}</span>
      </div>`;
    }
  }
  
  if (items.length === 0) {
    html = '<div style="text-align:center;color:var(--text-muted);padding:30px">空目录</div>';
  }
  
  return html;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function confirmRemotePath() {
  let finalPath = browserCurrentDir;
  if (!finalPath.endsWith('/')) finalPath += '/';
  
  const select = document.getElementById('remotePath');
  // 检查是否已有该选项
  let found = false;
  for (const opt of select.options) {
    if (opt.value === finalPath) { opt.selected = true; found = true; break; }
  }
  // 没有则追加一个临时选项
  if (!found) {
    const newOpt = new Option(`${finalPath} (浏览选择)`, finalPath, false, true);
    select.appendChild(newOpt);
  }
  closeModal('remoteBrowserModal');
}

function showLogModal(buildOnly) {
  document.getElementById('logTitle').textContent = buildOnly ? '构建进度' : '部署进度';
  const modules = currentProject.type === 'multi-module' ? [...modalState[activeCtx].checkedModules] : ['整体构建'];
  document.getElementById('logSubtitle').textContent = `${currentProject.name} · ${modules.join(', ')}`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '0%';

  const steps = buildOnly ? ['拉取代码', '构建中'] : ['预检', '拉取代码', '构建中', '上传中', '完成'];
  document.getElementById('progressSteps').innerHTML = steps.map((s, i) =>
    `<div class="step${i === 0 ? ' active' : ''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');

  document.getElementById('logModal').classList.add('active');
  updateLogModalCloseBtn();
}

function appendLog(text, type = 'info') {
  const terminal = document.getElementById('logTerminal');
  // DOM 节点上限保护：防止超大日志导致页面卡顿
  const MAX_LOG_LINES = 3000;
  while (terminal.childElementCount >= MAX_LOG_LINES) {
    terminal.removeChild(terminal.firstChild);
  }
  const clsMap = { cmd: 'log-cmd', info: 'log-info', success: 'log-success', warn: 'log-warn', error: 'log-error' };
  // 清理 ANSI 转义码（webpack/npm 等工具的颜色残留）
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

// Ctrl+F / Cmd+F 打开搜索
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

  if (!keyword) {
    document.getElementById('logSearchInfo').textContent = '';
    return;
  }

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
  if (logSearchMatches.length === 0) {
    info.textContent = '无匹配';
  } else {
    info.textContent = `${logSearchCurrentIdx + 1}/${logSearchMatches.length}`;
  }
}

function clearLogHighlights() {
  document.querySelectorAll('.log-line.log-highlight').forEach(el => {
    el.classList.remove('log-highlight', 'log-highlight-active');
  });
}

// ========== Git Log 预览 ==========
async function loadGitLog(projectName, targetElId) {
  const el = document.getElementById(targetElId);
  try {
    const data = await API.get(`/api/projects/${projectName}/git-log`);
    if (!data.commits || data.commits.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.innerHTML = `
      <div class="git-log-header">
        <span>📋 最近提交</span>
        <span class="git-log-branch">${data.branch}</span>
      </div>
      <div class="git-log-list">
        ${data.commits.map(c => `
          <div class="git-log-item">
            <span class="git-log-time">${gitTimeAgo(c.time)}</span>
            <span class="git-log-hash">${c.hash}</span>
            <span class="git-log-msg">${escapeHtml(c.message)}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch {
    el.style.display = 'none';
  }
}

function gitTimeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨天';
  return `${d}天前`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// ========== 刷新后活跃任务恢复 ==========
let _checkActiveJobRunning = false;
async function checkActiveJob() {
  // 防重入：DOMContentLoaded + WS.onopen 可能同时触发
  if (_checkActiveJobRunning) return;
  // 已恢复过则不重复执行
  if (activeTask && activeTask.isRunning && currentDeployId) return;
  _checkActiveJobRunning = true;
  try {
    const job = await API.get('/api/deploy/active');
    if (!job) return;

    // 恢复前端状态
    currentDeployId = job.id;
    activeTask = { id: job.id, projectName: job.projectName, isRunning: true };
    setBusy(job.projectName);

    // 初始化日志弹窗
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

    // 恢复阶段指示器状态
    const phaseMap = { preflight: 0, pulling: 1, building: 2, uploading: 3 };
    const activeIdx = phaseMap[job.phase] ?? 0;
    for (let i = 0; i < activeIdx; i++) setStepDone(i);
    setStepActive(activeIdx);

    // 回放已积累的日志
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

    // 弹出弹窗
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

// ========== Server Management ==========
async function loadServers() {
  try {
    servers = await API.get('/api/servers');
    renderServers();
  } catch (e) {
    console.error('加载服务器失败:', e);
  }
}

function renderServers() {
  const list = document.getElementById('serverList');
  if (servers.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无服务器，点击"添加服务器"按钮</div>';
    return;
  }
  list.innerHTML = `
    <div class="server-row server-head">
      <div>名称</div><div>Host</div><div>用户</div><div>端口</div><div>目标路径</div><div>操作</div>
    </div>
    ${servers.map(s => `
    <div class="server-row server-card">
      <div class="server-name">📦 ${s.name}</div>
      <div class="server-host">${s.host}</div>
      <div>${s.username}</div>
      <div>${s.port}</div>
      <div class="server-host">${s.defaultRemotePath || '/'}</div>
      <div class="server-actions">
        <button class="btn-icon" title="编辑" onclick="editServer('${s.id}')">✎</button>
        <button class="btn-icon" title="测试连接" onclick="testServer('${s.id}', this)">⚡</button>
        <button class="btn-icon danger" title="删除" onclick="deleteServer('${s.id}')">🗑</button>
      </div>
    </div>`).join('')}`;
}

// 发布目录标签列表（内存态）
let sfDeployPaths = [];

function showServerForm(server = null) {
  document.getElementById('serverFormTitle').textContent = server ? '编辑服务器' : '添加服务器';
  document.getElementById('sf_id').value = server ? server.id : '';
  document.getElementById('sf_name').value = server ? server.name : '';
  document.getElementById('sf_host').value = server ? server.host : '';
  document.getElementById('sf_port').value = server ? server.port : 22;
  document.getElementById('sf_username').value = server ? server.username : 'root';
  document.getElementById('sf_authType').value = server ? server.authType : 'password';
  document.getElementById('sf_password').value = '';
  document.getElementById('sf_remotePath').value = server ? (server.defaultRemotePath || '/') : '/';
  
  // 初始化 Tag 列表
  sfDeployPaths = server && Array.isArray(server.deployPaths) ? [...server.deployPaths] : [];
  renderPathTags();
  document.getElementById('sf_newPathInput').value = '';
  
  document.getElementById('serverFormModal').classList.add('active');
}

function renderPathTags() {
  const tagList = document.getElementById('sf_tagList');
  tagList.innerHTML = sfDeployPaths.map((p, i) => `
    <span class="path-tag${i === 0 ? ' is-default' : ''}" data-index="${i}">
      ${i === 0 ? '<span class="tag-badge">默认</span>' : ''}
      <span class="tag-text" title="双击编辑" ondblclick="editPathTag(${i}, this)">${p}</span>
      <button class="tag-remove" onclick="removePathTag(${i})" title="删除">✕</button>
    </span>
  `).join('');
}

function editPathTag(index, textEl) {
  const tag = textEl.closest('.path-tag');
  const currentValue = sfDeployPaths[index];
  
  // 创建编辑输入框替换文本
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'tag-edit-input';
  
  // 替换 tag-text 为 input
  textEl.replaceWith(input);
  input.focus();
  input.select();
  
  function confirmEdit() {
    let newPath = input.value.trim();
    if (newPath) {
      if (!newPath.startsWith('/')) newPath = '/' + newPath;
      if (!newPath.endsWith('/')) newPath += '/';
      sfDeployPaths[index] = newPath;
    }
    renderPathTags();
  }
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') { renderPathTags(); }
  });
  input.addEventListener('blur', confirmEdit);
}

function removePathTag(index) {
  sfDeployPaths.splice(index, 1);
  renderPathTags();
}

// 绑定 Tag 输入事件
document.addEventListener('keydown', (e) => {
  const input = document.getElementById('sf_newPathInput');
  if (document.activeElement !== input) return;
  
  if (e.key === 'Enter') {
    e.preventDefault();
    let path = input.value.trim();
    if (!path) return;
    if (!path.startsWith('/')) path = '/' + path;
    if (!path.endsWith('/')) path += '/';
    if (sfDeployPaths.includes(path)) {
      input.value = '';
      input.placeholder = '⚠ 该路径已存在';
      setTimeout(() => { input.placeholder = '输入路径后按 Enter 添加'; }, 1200);
      return;
    }
    sfDeployPaths.push(path);
    input.value = '';
    renderPathTags();
  }
  
  // Backspace 空输入时删除最后一个标签
  if (e.key === 'Backspace' && !input.value && sfDeployPaths.length > 0) {
    sfDeployPaths.pop();
    renderPathTags();
  }
});

function editServer(id) {
  const server = servers.find(s => s.id === id);
  if (server) showServerForm(server);
}

async function saveServer() {
  const id = document.getElementById('sf_id').value;
  const passwordValue = document.getElementById('sf_password').value;

  const data = {
    name: document.getElementById('sf_name').value,
    host: document.getElementById('sf_host').value,
    port: document.getElementById('sf_port').value,
    username: document.getElementById('sf_username').value,
    authType: document.getElementById('sf_authType').value,
    defaultRemotePath: document.getElementById('sf_remotePath').value || '/',
    deployPaths: sfDeployPaths,
  };

  // 只有用户实际修改了密码才发送，避免脱敏占位符覆盖真实密码
  const isMasked = /^\*+$/.test(passwordValue);
  if (!isMasked && passwordValue) {
    data.password = passwordValue;
  }

  if (!data.name || !data.host) { await showAlert('名称和 Host 必填', { icon: '⚠️' }); return; }
  try {
    if (id) await API.put(`/api/servers/${id}`, data);
    else await API.post('/api/servers', data);
    closeModal('serverFormModal');
    await loadServers();
  } catch (e) {
    showAlert('保存失败: ' + e.message, { icon: '❌' });
  }
}

async function deleteServer(id) {
  if (!await showConfirm('确定删除该服务器？', { icon: '🗑️', danger: true, confirmText: '删除' })) return;
  try {
    await API.del(`/api/servers/${id}`);
    await loadServers();
  } catch (e) {
    showAlert('删除失败: ' + e.message, { icon: '❌' });
  }
}

async function testServer(id, btn) {
  // 找到服务器信息
  const server = servers.find(s => s.id === id);
  const serverName = server ? server.name : id;
  const serverHost = server ? `${server.username}@${server.host}:${server.port}` : '';

  // 打开日志弹窗
  document.getElementById('logTitle').textContent = '连接测试';
  document.getElementById('logSubtitle').textContent = `${serverName} (${serverHost})`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '';

  const steps = ['连接中', 'SFTP', '完成'];
  document.getElementById('progressSteps').innerHTML = steps.map((s, i) =>
    `<div class="step${i === 0 ? ' active' : ''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');

  document.getElementById('logModal').classList.add('active');

  try {
    const data = await API.post(`/api/servers/${id}/test`);
    currentDeployId = data.id;
  } catch (e) {
    appendLog('请求失败: ' + e.message, 'error');
  }
}

// ========== History ==========
let historyData = [];          // 完整历史数据缓存
let batchSelectMode = false;   // 批量选择模式
let selectedHistoryIds = new Set();

async function loadHistory() {
  try {
    historyData = await API.get('/api/history');
    renderHistory();
  } catch (e) {
    console.error('加载历史失败:', e);
  }
}

// chip 过滤切换（与 Dashboard 同风格）
let chipFilters = { segType: 'all', segStatus: 'all' };

function setChipFilter(btn, group) {
  document.querySelectorAll(`.chip[data-seg="${group}"]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  chipFilters[group] = btn.dataset.value;
  renderHistory();
}

function getSegValue(groupId) {
  return chipFilters[groupId] || 'all';
}

function renderHistory() {
  const typeFilter = getSegValue('segType');
  const statusFilter = getSegValue('segStatus');

  let filtered = historyData;
  if (typeFilter !== 'all') filtered = filtered.filter(h => h.type === typeFilter);
  if (statusFilter !== 'all') filtered = filtered.filter(h => h.status === statusFilter);

  // 统计信息
  const statsEl = document.getElementById('historyStats');
  if (statsEl) {
    const total = historyData.length;
    const successCount = historyData.filter(h => h.status === 'success').length;
    const failCount = total - successCount;
    const filterNote = filtered.length !== total ? ` · 当前筛选 ${filtered.length} 条` : '';
    statsEl.textContent = `共 ${total} 条记录 · ✅ ${successCount} 成功 · ❌ ${failCount} 失败${filterNote}`;
  }

  const table = document.getElementById('historyTable');
  if (filtered.length === 0) {
    table.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无匹配的部署记录</div>';
    return;
  }

  const checkHeader = batchSelectMode ? '<div class="h-cell h-check"></div>' : '';

  table.innerHTML = `
    <div class="history-row history-header">
      ${checkHeader}
      <div class="h-cell h-time">时间</div>
      <div class="h-cell h-project">项目</div>
      <div class="h-cell h-type">类型</div>
      <div class="h-cell h-modules">模块</div>
      <div class="h-cell h-server">服务器</div>
      <div class="h-cell h-status">状态</div>
      <div class="h-cell h-actions">操作</div>
    </div>
    ${filtered.map(h => {
      const time = new Date(h.timestamp).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      const typeLabel = h.type === 'deploy' ? '部署' : '构建';
      const typeDot = h.type === 'deploy' ? 'deploy' : 'build';
      const statusText = h.status === 'success' ? h.duration : '失败';
      const isSelected = selectedHistoryIds.has(h.id);
      const checkCell = batchSelectMode
        ? `<div class="h-cell h-check"><input type="checkbox" class="ios-check" ${isSelected ? 'checked' : ''} onchange="toggleHistorySelect('${h.id}', this.checked)"></div>`
        : '';
      return `<div class="history-row ${isSelected ? 'row-selected' : ''}">
        ${checkCell}
        <div class="h-cell h-time">${time}</div>
        <div class="h-cell h-project">${h.projectName}</div>
        <div class="h-cell h-type"><span class="type-pill ${typeDot}">${typeLabel}</span></div>
        <div class="h-cell h-modules"><span class="history-modules">${(h.modules || []).map(m => `<span class="module-tag">${m}</span>`).join('')}</span></div>
        <div class="h-cell h-server">${h.serverName || '—'}</div>
        <div class="h-cell h-status ${h.status === 'success' ? 'status-success' : 'status-fail'}"><span class="status-dot-mini"></span>${statusText}</div>
        <div class="h-cell h-actions">
          <button class="btn-icon" onclick="viewLog('${h.id}')" title="查看日志">⌗</button>
          <button class="btn-icon danger" onclick="event.stopPropagation();deleteSingleHistory('${h.id}')" title="删除">⌫</button>
        </div>
      </div>`;
    }).join('')}`;
}

// 批量选择模式切换
function toggleBatchSelect() {
  batchSelectMode = !batchSelectMode;
  selectedHistoryIds.clear();
  const btn = document.getElementById('btnToggleSelect');
  const delBtn = document.getElementById('btnBatchDelete');
  if (batchSelectMode) {
    btn.textContent = '✕ 取消';
    btn.className = 'btn-primary';
    btn.style.cssText = 'padding:8px 16px';
    delBtn.style.display = 'inline-flex';
  } else {
    btn.textContent = '☑ 选择';
    btn.className = 'btn-secondary';
    btn.style.cssText = 'padding:8px 16px';
    delBtn.style.display = 'none';
  }
  updateBatchCount();
  renderHistory();
}

// 选中/取消选中某条记录
function toggleHistorySelect(id, checked) {
  if (checked) selectedHistoryIds.add(id);
  else selectedHistoryIds.delete(id);
  updateBatchCount();
  renderHistory();
}

function updateBatchCount() {
  document.getElementById('batchCount').textContent = selectedHistoryIds.size;
  const btn = document.getElementById('btnBatchDelete');
  btn.disabled = selectedHistoryIds.size === 0;
}

// 删除单条
async function deleteSingleHistory(id) {
  if (!await showConfirm('确认删除这条记录？', { icon: '🗑️', danger: true, confirmText: '删除' })) return;
  try {
    await API.delete(`/api/history/${id}`);
    historyData = historyData.filter(h => h.id !== id);
    selectedHistoryIds.delete(id);
    renderHistory();
    showToast('🗑 已删除', '1 条记录已移除');
  } catch (e) {
    showAlert('删除失败: ' + e.message, { icon: '❌' });
  }
}

// 批量删除
async function batchDeleteHistory() {
  const count = selectedHistoryIds.size;
  if (count === 0) return;
  if (!await showConfirm(`确认删除选中的 ${count} 条记录？此操作不可撤销。`, { icon: '🗑️', danger: true, confirmText: '全部删除' })) return;
  try {
    const ids = [...selectedHistoryIds];
    await API.delete('/api/history', { ids });
    historyData = historyData.filter(h => !selectedHistoryIds.has(h.id));
    selectedHistoryIds.clear();
    updateBatchCount();
    renderHistory();
    showToast('🗑 批量删除完成', `已移除 ${count} 条记录`);
  } catch (e) {
    showAlert('批量删除失败: ' + e.message, { icon: '❌' });
  }
}

// 显示整理弹窗
function showCleanupDialog() {
  document.getElementById('cleanupModal').classList.add('active');
}

// 执行自动整理
async function executeCleanup() {
  const keepDays = parseInt(document.getElementById('cleanupKeepDays').value) || 30;
  const keepPerProject = parseInt(document.getElementById('cleanupKeepPerProject').value) || 5;
  try {
    const result = await API.post('/api/history/cleanup', { keepDays, keepPerProject });
    closeModal('cleanupModal');
    showToast('🧹 整理完成', `清理了 ${result.deleted} 条，剩余 ${result.after} 条`);
    await loadHistory();
  } catch (e) {
    showAlert('整理失败: ' + e.message, { icon: '❌' });
  }
}

async function viewLog(id) {
  try {
    const record = await API.get(`/api/history/${id}`);
    currentDeployId = id;
    document.getElementById('logTitle').textContent = '部署日志';
    document.getElementById('logSubtitle').textContent = `${record.projectName} · ${(record.modules || []).join(', ')}`;
    document.getElementById('logTerminal').innerHTML = '';
    document.getElementById('progressBar').style.width = '100%';
    document.getElementById('progressText').textContent = '100%';
    document.getElementById('progressSteps').innerHTML = '';
    const result = document.getElementById('deployResult');
    result.style.display = 'flex';
    document.getElementById('resultIcon').textContent = record.status === 'success' ? '✅' : '❌';
    document.getElementById('resultText').innerHTML = record.status === 'success'
      ? `部署完成！耗时 <strong>${record.duration}</strong>` : '部署失败';
    (record.logs || []).forEach(l => appendLog(l.text, l.type));
    document.getElementById('logModal').classList.add('active');
  } catch (e) {
    showAlert('加载日志失败: ' + e.message, { icon: '❌' });
  }
}

// ========== Utils ==========
function closeModal(id) {
  // 如果关闭的是日志弹窗且任务正在进行中，执行最小化而非关闭
  if (id === 'logModal' && activeTask && activeTask.isRunning) {
    document.getElementById(id).classList.remove('active');
    showToast('📌 任务仍在后台运行', '点击此处可查看进度', { clickable: true, persistent: true });
    return;
  }
  document.getElementById(id).classList.remove('active');
  // 如果是日志弹窗且任务已完成，清理 activeTask
  if (id === 'logModal') {
    activeTask = null;
  }
}

// 恢复日志弹窗
function reopenLogModal() {
  const logModal = document.getElementById('logModal');
  if (logModal) logModal.classList.add('active');
}

// 更新日志弹窗关闭按钮文案
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

// Toast 通知
function showToast(title, message, options = {}) {
  // options: { clickable: bool, persistent: bool }
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

  // ❌ 关闭按钮
  toast.querySelector('.toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast();
  });

  // 点击 toast 打开日志弹窗
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

// ========== FileZilla Import ==========
let fzServers = [];
let checkedFzServers = new Set();
let currentFzXmlContent = ''; // 当前加载的 XML 文件内容

async function showFileZillaImport() {
  checkedFzServers.clear();
  currentFzXmlContent = '';
  document.getElementById('fzFileName').textContent = '';
  document.getElementById('fzFileInput').value = '';
  try {
    const data = await API.get('/api/servers/filezilla');
    fzServers = data.servers || [];
    document.getElementById('fzPath').textContent = `默认配置: ${data.path}`;
  } catch (e) {
    fzServers = [];
    document.getElementById('fzPath').textContent = '未找到默认配置，请选择 FileZilla 导出的 XML 文件';
  }
  // 已导入的默认勾选
  fzServers.filter(s => s.exists).forEach(s => checkedFzServers.add(s.name));
  renderFzServers();
  document.getElementById('filezillaModal').classList.add('active');
}

function loadFzFromFile(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('fzFileName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const xmlContent = e.target.result;
    currentFzXmlContent = xmlContent;
    checkedFzServers.clear();
    try {
      const data = await API.post('/api/servers/filezilla/parse', { xmlContent });
      fzServers = data.servers || [];
      document.getElementById('fzPath').textContent = `已加载: ${file.name}`;
      // 已导入的默认勾选
      fzServers.filter(s => s.exists).forEach(s => checkedFzServers.add(s.name));
    } catch (err) {
      fzServers = [];
      showAlert('解析失败: ' + (err.message || '文件格式错误'), { icon: '❌' });
    }
    renderFzServers();
  };
  reader.readAsText(file, 'utf-8');
}

function renderFzServers() {
  const grid = document.getElementById('fzServerGrid');
  if (fzServers.length === 0) {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;grid-column:1/-1">未找到 SFTP 服务器配置</div>';
    return;
  }
  grid.innerHTML = fzServers.map(s => {
    const checked = checkedFzServers.has(s.name);
    const statusTag = s.exists
      ? (checked ? '<span style="font-size:10px;color:var(--success);margin-left:4px">已导入</span>' : '<span style="font-size:10px;color:var(--error);margin-left:4px">将删除</span>')
      : (checked ? '<span style="font-size:10px;color:var(--info);margin-left:4px">待导入</span>' : '');
    return `
    <div class="module-item ${checked ? 'checked' : ''} ${!checked && s.exists ? 'will-remove' : ''}"
         onclick="toggleFzServer('${s.name}')"
         title="${s.username}@${s.host}:${s.port}">
      <div class="checkbox">${checked ? '✓' : ''}</div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <span>${s.name}${statusTag}</span>
        <span style="font-size:11px;color:var(--text-muted)">${s.host}:${s.port}</span>
      </div>
    </div>`;
  }).join('');

  const toAdd = fzServers.filter(s => !s.exists && checkedFzServers.has(s.name)).length;
  const toRemove = fzServers.filter(s => s.exists && !checkedFzServers.has(s.name)).length;
  const parts = [];
  if (toAdd) parts.push(`新增 ${toAdd}`);
  if (toRemove) parts.push(`删除 ${toRemove}`);
  document.getElementById('fzSelectedCount').textContent = parts.length ? parts.join('，') : `已选 ${checkedFzServers.size} 个`;
}

function toggleFzServer(name) {
  checkedFzServers.has(name) ? checkedFzServers.delete(name) : checkedFzServers.add(name);
  renderFzServers();
}

function toggleAllFz(check) {
  if (check) fzServers.forEach(s => checkedFzServers.add(s.name));
  else checkedFzServers.clear();
  renderFzServers();
}

async function importFileZillaServers() {
  // 计算新增和删除
  const toAdd = fzServers.filter(s => !s.exists && checkedFzServers.has(s.name)).map(s => s.name);
  const toRemove = fzServers.filter(s => s.exists && !checkedFzServers.has(s.name));

  if (toAdd.length === 0 && toRemove.length === 0) { await showAlert('没有变更', { icon: 'ℹ️' }); return; }

  // 删除确认
  if (toRemove.length > 0) {
    const names = toRemove.map(s => s.name).join('、');
    if (!await showConfirm(`将删除 ${toRemove.length} 个服务器：${names}\n确定继续？`, { icon: '🗑️', danger: true, confirmText: '继续删除' })) return;
  }

  try {
    const msgs = [];

    // 执行删除
    if (toRemove.length > 0) {
      for (const s of toRemove) {
        // 通过 host:port 找到实际的服务器 ID 来删除
        const existing = servers.find(e => e.host === s.host && String(e.port) === String(s.port));
        if (existing) await API.del(`/api/servers/${existing.id}`);
      }
      msgs.push(`删除 ${toRemove.length} 个`);
    }

    // 执行导入
    if (toAdd.length > 0) {
      const body = { selected: toAdd };
      if (currentFzXmlContent) body.xmlContent = currentFzXmlContent;
      const result = await API.post('/api/servers/filezilla/import', body);
      msgs.push(`新增 ${result.added.length} 个`);
      if (result.skipped.length) msgs.push(`${result.skipped.length} 个已存在被跳过`);
    }

    closeModal('filezillaModal');
    await loadServers();
    showAlert('同步完成：' + msgs.join('，'), { icon: '✅' });
  } catch (e) {
    showAlert('操作失败: ' + e.message, { icon: '❌' });
  }
}


// ========== Git 周报模块 ==========
let rptRepos = [{ repo: '', branch: '', group: '' }];
let rptLastResults = null;
let rptHideEmpty = true;
let rptReportMode = 'week';
let rptCurrentView = 'repo';
const RPT_WEEKDAYS = ['周一','周二','周三','周四','周五','周六','周日'];
const RPT_COMMIT_TYPES = {feat:'feat',fix:'fix',refactor:'refactor',style:'style',chore:'chore',docs:'docs',perf:'perf',test:'test',build:'chore',ci:'chore'};

// 初始化周报（页面切换时调用）
async function initReport() {
  rptSetDefaultDates();
  try {
    const cfg = await API.get('/api/report/config');
    if (cfg.token) document.getElementById('rptToken').value = cfg.token;
    if (cfg.author) document.getElementById('rptAuthor').value = cfg.author;
    if (cfg.repos && cfg.repos.length) rptRepos = cfg.repos.map(r => ({...r, group: r.group || ''}));
  } catch(e) {}
  rptRenderRepos();
}

function rptSetDefaultDates() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  document.getElementById('rptSince').value = rptFmt(mon);
  document.getElementById('rptUntil').value = rptFmt(sun);
}

function rptFmt(d) { return d.toISOString().slice(0, 10); }

function rptSwitchMode(mode) {
  rptReportMode = mode;
  document.getElementById('rptModeWeek').classList.toggle('active', mode === 'week');
  document.getElementById('rptModeDay').classList.toggle('active', mode === 'day');
  document.getElementById('rptGenBtn').textContent = mode === 'day' ? '🚀 生成日报' : '🚀 生成周报';
  document.getElementById('rptDateRow').style.display = mode === 'day' ? 'none' : 'flex';
  document.getElementById('rptDatePresets').style.display = mode === 'day' ? 'none' : 'flex';
  if (mode === 'day') {
    const now = new Date();
    document.getElementById('rptSince').value = rptFmt(now);
    document.getElementById('rptUntil').value = rptFmt(now);
  } else {
    rptSetDefaultDates();
  }
}

function rptToggleToken() {
  const inp = document.getElementById('rptToken');
  const btn = inp.parentElement.querySelector('.rpt-token-toggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁️'; }
}

function rptApplyPreset(preset) {
  const now = new Date();
  let s, e;
  const day = now.getDay() || 7;
  switch(preset) {
    case 'thisWeek': s = new Date(now); s.setDate(now.getDate() - day + 1); e = new Date(s); e.setDate(s.getDate() + 6); break;
    case 'lastWeek': s = new Date(now); s.setDate(now.getDate() - day - 6); e = new Date(s); e.setDate(s.getDate() + 6); break;
    case 'last3': s = new Date(now); s.setDate(now.getDate() - 2); e = new Date(now); break;
    case 'thisMonth': s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now.getFullYear(), now.getMonth() + 1, 0); break;
    case 'lastMonth': s = new Date(now.getFullYear(), now.getMonth() - 1, 1); e = new Date(now.getFullYear(), now.getMonth(), 0); break;
  }
  document.getElementById('rptSince').value = rptFmt(s);
  document.getElementById('rptUntil').value = rptFmt(e);
  document.querySelectorAll('.rpt-preset').forEach(b => b.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

// 仓库列表
function rptRenderRepos() {
  const el = document.getElementById('rptRepoList');
  const search = (document.getElementById('rptRepoSearch')?.value || '').toLowerCase();
  document.getElementById('rptRepoCount').textContent = rptRepos.length;
  const filtered = rptRepos.map((r, i) => ({...r, idx: i})).filter(r =>
    !search || r.repo.toLowerCase().includes(search) || (r.branch||'').toLowerCase().includes(search) || (r.group||'').toLowerCase().includes(search)
  );
  el.innerHTML = filtered.map(r => `
    <div class="rpt-repo-item">
      ${rptRepos.length > 1 ? `<button class="rpt-repo-del" onclick="rptDelRepo(${r.idx})">×</button>` : ''}
      <div class="rfield"><label>仓库地址</label><input value="${rptEsc(r.repo)}" onchange="rptRepos[${r.idx}].repo=this.value" placeholder="http://.../group/project.git"></div>
      <div class="rfield-row">
        <div class="rfield"><label>分支</label><input value="${rptEsc(r.branch||'')}" onchange="rptRepos[${r.idx}].branch=this.value" placeholder="默认主分支"></div>
        <div class="rfield"><label>分组</label><input value="${rptEsc(r.group||'')}" onchange="rptRepos[${r.idx}].group=this.value" placeholder="可选"></div>
      </div>
    </div>
  `).join('') || '<div style="text-align:center;color:var(--text-muted);padding:20px">暂无仓库</div>';
}

function rptFilterRepos() { rptRenderRepos(); }
function rptAddRepo() { rptRepos.unshift({ repo: '', branch: '', group: '' }); rptRenderRepos(); }
function rptDelRepo(i) { rptRepos.splice(i, 1); rptRenderRepos(); }
function rptEsc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 保存配置
async function rptSaveConfig() {
  try {
    await API.post('/api/report/config', {
      token: document.getElementById('rptToken').value,
      author: document.getElementById('rptAuthor').value,
      repos: rptRepos
    });
    showToast('✅ 配置已保存', '周报配置已更新');
  } catch(e) { showAlert('保存失败: ' + e.message, { icon: '❌' }); }
}

// 生成周报（增量加载）
async function rptGenerate() {
  const btn = document.getElementById('rptGenBtn');
  const area = document.getElementById('rptResultArea');
  const progress = document.getElementById('rptGenProgress');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '⏳ 生成中...';
  area.innerHTML = '';
  document.getElementById('rptSummaryBar').style.display = 'none';
  document.getElementById('rptToolbar').style.display = 'flex';
  rptSyncToggleUI();

  const token = document.getElementById('rptToken').value;
  const author = document.getElementById('rptAuthor').value;
  const since = document.getElementById('rptSince').value;
  const until = document.getElementById('rptUntil').value;
  const validRepos = rptRepos.filter(r => r.repo.trim());
  const total = validRepos.length;

  if (!token) { await showAlert('请填写 GitLab Token', { icon: '⚠️' }); btn.disabled = false; btn.textContent = '🚀 生成周报'; return; }
  if (total === 0) { await showAlert('请至少添加一个仓库', { icon: '⚠️' }); btn.disabled = false; btn.textContent = '🚀 生成周报'; return; }

  progress.style.display = 'flex';
  document.getElementById('rptGpFill').style.width = '0%';
  document.getElementById('rptGpText').textContent = `0/${total}`;
  document.getElementById('rptGpLabel').textContent = '正在拉取提交记录...';

  const results = [];
  let done = 0;

  const tasks = validRepos.map(item => {
    return API.post('/api/report/generate-single', { token, author, since, until, repo: item.repo, branch: item.branch, group: item.group })
      .then(data => {
        done++;
        document.getElementById('rptGpFill').style.width = Math.round((done / total) * 100) + '%';
        document.getElementById('rptGpText').textContent = `${done}/${total}`;
        results.push(data);
        rptLastResults = results;
        rptRenderResults(results);
      })
      .catch(err => {
        done++;
        document.getElementById('rptGpFill').style.width = Math.round((done / total) * 100) + '%';
        document.getElementById('rptGpText').textContent = `${done}/${total}`;
        results.push({ project: item.repo.split('/').pop().replace('.git',''), repo: item.repo, branch: item.branch, group: item.group, logs: [], error: err.message });
      });
  });

  await Promise.all(tasks);
  rptLastResults = results;
  rptRenderResults(results);
  progress.style.display = 'none';
  btn.disabled = false;
  btn.textContent = rptReportMode === 'day' ? '🚀 生成日报' : '🚀 生成周报';
  showToast('✅ 周报生成完成', `${results.length} 个仓库`);
}

// 渲染结果
function rptRenderResults(results) {
  const total = results.reduce((s, r) => s + (r.logs||[]).length, 0);
  const failed = results.filter(r => r.error).length;
  const emptyCount = results.filter(r => !r.error && !(r.logs||[]).length).length;
  const bar = document.getElementById('rptSummaryBar');
  bar.style.display = 'flex';
  bar.innerHTML = `<span class="rpt-stat">仓库: <span class="num">${results.length}</span></span>
    <span class="rpt-stat">提交: <span class="num">${total}</span></span>
    ${emptyCount ? `<span class="rpt-stat" style="color:var(--text-muted)">空: ${emptyCount}</span>` : ''}
    ${failed ? `<span class="rpt-stat" style="color:var(--danger)">失败: ${failed}</span>` : ''}`;

  const display = rptHideEmpty ? results.filter(r => r.error || (r.logs||[]).length > 0) : results;
  const area = document.getElementById('rptResultArea');
  if (display.length === 0) {
    area.innerHTML = '<div class="rpt-empty-state"><div style="font-size:2rem;margin-bottom:8px">📭</div><div>该时间范围内无提交记录</div></div>';
    return;
  }

  if (rptCurrentView === 'date') { area.innerHTML = rptRenderTimelineView(display); return; }

  // 按仓库视图
  const hasGroups = display.some(r => r.group);
  if (hasGroups) {
    const grouped = {};
    display.forEach(r => { const g = r.group || '未分组'; (grouped[g] = grouped[g] || []).push(r); });
    area.innerHTML = Object.entries(grouped).map(([g, items]) => {
      const gTotal = items.reduce((s, r) => s + (r.logs||[]).length, 0);
      return `<div class="rpt-result-group">
        <div class="rpt-result-group-title"><span class="rg-name">📂 ${rptEsc(g)}</span><span class="rg-pill repos">${items.length} 仓库</span><span class="rg-pill commits">${gTotal} 提交</span></div>
        <div>${items.map(r => rptRenderResultItem(r)).join('')}</div>
      </div>`;
    }).join('');
  } else {
    area.innerHTML = display.map(r => rptRenderResultItem(r)).join('');
  }
}

function rptRenderResultItem(r) {
  const name = (r.project || '').split('/').pop().replace('.git', '');
  const bl = r.branch ? ` <span style="color:#4f8ff7;font-size:.68rem">[${rptEsc(r.branch)}]</span>` : '';
  let body;
  if (r.error) { body = `<div style="color:var(--danger);font-size:.82rem">❌ ${rptEsc(r.error)}</div>`; }
  else if (!(r.logs||[]).length) { body = '<div style="color:var(--text-muted);font-style:italic;font-size:.82rem">无提交记录</div>'; }
  else {
    const grouped = {};
    r.logs.forEach(l => { const k = l.date + '|' + (l.author||''); (grouped[k] = grouped[k] || []).push(l.subject); });
    const rows = Object.entries(grouped).map(([k, subs]) => {
      const [d, a] = k.split('|');
      const wd = RPT_WEEKDAYS[new Date(d).getDay() === 0 ? 6 : new Date(d).getDay() - 1];
      return `<tr><td>${d}</td><td>${wd}</td><td>${rptEsc(a)}</td><td class="subject">${subs.map(s => rptTagCommit(s)).join('<br>')}</td></tr>`;
    }).join('');
    body = `<table><thead><tr><th style="width:90px">日期</th><th style="width:45px">星期</th><th style="width:60px">作者</th><th>提交内容</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return `<div class="rpt-result-section"><h3>${rptEsc(name)}${bl}</h3>${body}</div>`;
}

function rptTagCommit(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?\s*[:：]\s*(.*)/);
  if (m) {
    const type = RPT_COMMIT_TYPES[m[1].toLowerCase()];
    if (type) return `<span class="rpt-commit-tag ${type}">${type}</span>• ${rptEsc(m[3])}`;
  }
  return '• ' + rptEsc(subject);
}

// 时间线视图
function rptRenderTimelineView(results) {
  const allLogs = [];
  results.forEach(r => {
    const name = (r.project||'').split('/').pop().replace('.git','');
    (r.logs||[]).forEach(l => allLogs.push({ ...l, repoName: name }));
  });
  allLogs.sort((a, b) => b.date.localeCompare(a.date));
  const byDate = {};
  allLogs.forEach(l => (byDate[l.date] = byDate[l.date] || []).push(l));
  return Object.entries(byDate).map(([date, logs]) => {
    const wd = RPT_WEEKDAYS[new Date(date).getDay() === 0 ? 6 : new Date(date).getDay() - 1];
    const items = logs.map(l => `<div class="rpt-timeline-item"><span class="tl-repo">${rptEsc(l.repoName)}</span>${rptTagCommit(l.subject)}</div>`).join('');
    return `<div class="rpt-timeline-day"><div class="rpt-timeline-date">📅 ${date} <span style="font-size:.65rem;color:var(--text-muted)">${wd}</span></div>${items}</div>`;
  }).join('');
}

// 工具栏功能
function rptToggleHideEmpty() {
  rptHideEmpty = !rptHideEmpty;
  rptSyncToggleUI();
  if (rptLastResults) rptRenderResults(rptLastResults);
}

function rptSyncToggleUI() {
  const track = document.getElementById('rptHideEmptyToggle');
  const label = document.getElementById('rptHideEmptyLabel');
  if (rptHideEmpty) { track.classList.add('active'); label.textContent = '已隐藏空仓库'; }
  else { track.classList.remove('active'); label.textContent = '显示全部仓库'; }
}

function rptSwitchView(view) {
  rptCurrentView = view;
  document.getElementById('rptViewRepo').classList.toggle('active', view === 'repo');
  document.getElementById('rptViewDate').classList.toggle('active', view === 'date');
  if (rptLastResults) rptRenderResults(rptLastResults);
}

function rptFilterCommits() {
  const q = (document.getElementById('rptCommitSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#rptResultArea .rpt-result-section').forEach(sec => {
    const rows = sec.querySelectorAll('tbody tr');
    if (!rows.length) return;
    let visible = 0;
    rows.forEach(tr => {
      const td = tr.querySelector('td.subject');
      if (!td) return;
      if (!q || td.textContent.toLowerCase().includes(q)) { tr.style.display = ''; visible++; }
      else { tr.style.display = 'none'; }
    });
    sec.style.display = visible || !q ? '' : 'none';
  });
}

// 导出/复制
function rptBuildMarkdown() {
  if (!rptLastResults) return '';
  const since = document.getElementById('rptSince').value;
  const until = document.getElementById('rptUntil').value;
  const author = document.getElementById('rptAuthor').value;
  const total = rptLastResults.reduce((s, r) => s + (r.logs||[]).length, 0);
  let md = `# Git 仓库${rptReportMode === 'day' ? '日报' : '周报'}\n\n- 时间范围：${since} 至 ${until}\n- 作者：${author || '全部'}\n- 共 ${rptLastResults.length} 个仓库，${total} 条提交\n\n`;
  rptLastResults.forEach(r => {
    const name = (r.project||'').split('/').pop().replace('.git','');
    const bl = r.branch ? ` [${r.branch}]` : '';
    md += `## ${name}${bl}\n\n`;
    if (r.error) { md += `> 获取失败：${r.error}\n\n`; return; }
    if (!(r.logs||[]).length) { md += '无提交记录\n\n'; return; }
    md += '| 日期 | 星期 | 作者 | 提交内容 |\n| --- | --- | --- | --- |\n';
    const grouped = {};
    r.logs.forEach(l => { const k = l.date+'|'+(l.author||''); (grouped[k]=grouped[k]||[]).push(l.subject); });
    Object.entries(grouped).forEach(([k, subs]) => {
      const [d, a] = k.split('|');
      const wd = RPT_WEEKDAYS[new Date(d).getDay()===0?6:new Date(d).getDay()-1];
      md += `| ${d} | ${wd} | ${a} | ${subs.map(s=>'- '+s).join('<br>')} |\n`;
    });
    md += '\n';
  });
  return md;
}

function reportExportMD() {
  const md = rptBuildMarkdown();
  if (!md) { showAlert('请先生成周报', { icon: '⚠️' }); return; }
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `git-report_${document.getElementById('rptSince').value}_to_${document.getElementById('rptUntil').value}.md`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('📄 已下载 Markdown 文件');
}

function reportCopyResult() {
  const md = rptBuildMarkdown();
  if (!md) { showAlert('请先生成周报', { icon: '⚠️' }); return; }
  navigator.clipboard.writeText(md).then(() => showToast('📋 已复制到剪贴板'));
}

function reportShowSummary() {
  if (!rptLastResults) { showAlert('请先生成周报', { icon: '⚠️' }); return; }
  const TYPE_LABELS = { feat:'新增', fix:'修复', refactor:'重构', style:'样式优化', docs:'文档', perf:'性能优化', chore:'其他', test:'测试' };
  const typed = {};
  rptLastResults.forEach(r => {
    (r.logs||[]).forEach(l => {
      const m = l.subject.match(/^(\w+)(?:\([^)]*\))?\s*[:：]\s*(.*)/);
      let type = 'chore', desc = l.subject;
      if (m && RPT_COMMIT_TYPES[m[1].toLowerCase()]) { type = RPT_COMMIT_TYPES[m[1].toLowerCase()]; desc = m[2]; }
      (typed[type] = typed[type] || new Set()).add(desc.trim());
    });
  });
  let text = '';
  Object.entries(typed).forEach(([type, descs]) => {
    text += `- ${TYPE_LABELS[type]||type}：${[...descs].join('、')}\n`;
  });
  showAlert(text || '无提交记录', { icon: '📝' });
}

function reportShowHistory() {
  showAlert('历史记录功能开发中...', { icon: '📚' });
}

// 批量导入
function rptShowBatchImport() {
  const text = prompt('批量导入仓库\n每行一个地址，格式：地址 或 地址,分支');
  if (!text) return;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let count = 0;
  lines.forEach(line => {
    const parts = line.split(',').map(s => s.trim());
    const repo = parts[0], branch = parts[1] || '';
    if (repo && !rptRepos.some(r => r.repo === repo)) { rptRepos.push({ repo, branch, group: '' }); count++; }
  });
  rptRenderRepos();
  showToast(`✅ 已导入 ${count} 个仓库`);
}


// ========== 设置页 ==========
let settingsLoaded = false;

async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;

  // Sidecar 状态
  try {
    const health = await API.get('/api/health');
    const badge = document.getElementById('settingSidecarStatus');
    badge.textContent = `● 运行中 · PID ${health.pid} · 端口 ${API_BASE.split(':').pop()}`;
    badge.className = 'setting-badge online';
    document.getElementById('settingAbout').textContent = `macOS · Sidecar PID ${health.pid}`;
  } catch (e) {
    const badge = document.getElementById('settingSidecarStatus');
    badge.textContent = '● 离线';
    badge.className = 'setting-badge offline';
  }

  // Node 版本
  try {
    const data = await API.get('/api/projects/node-versions/list');
    document.getElementById('settingNodeVersion').textContent = data.current || data.versions?.[0] || '-';
  } catch (e) {}

  // 扫描目录
  document.getElementById('settingScanDir').textContent = '/Users/ldy/project/';

  // GitLab 配置
  try {
    const cfg = await API.get('/api/report/config');
    document.getElementById('settingToken').value = cfg.token || '';
    document.getElementById('settingAuthor').value = cfg.author || '';
    renderSettingRepos(cfg.repos || []);
  } catch (e) {}
}

function renderSettingRepos(repos) {
  const list = document.getElementById('settingRepoList');
  if (!repos || repos.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">暂无仓库，点击「+ 添加仓库」</div>';
    return;
  }
  list.innerHTML = repos.map((r, i) => `
    <div class="setting-repo-row" data-idx="${i}">
      <input type="text" class="repo-url" value="${(r.repo||'').replace(/"/g,'&quot;')}" placeholder="仓库地址 (http://...)">
      <input type="text" class="repo-branch" value="${(r.branch||'').replace(/"/g,'&quot;')}" placeholder="分支">
      <input type="text" class="repo-group" value="${(r.group||'').replace(/"/g,'&quot;')}" placeholder="分组">
      <button onclick="this.parentElement.remove()" title="删除">✕</button>
    </div>
  `).join('');
}

function settingsAddRepo() {
  const list = document.getElementById('settingRepoList');
  // 如果只有占位文字，清空
  if (list.querySelector('div:not(.setting-repo-row)')) list.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'setting-repo-row';
  div.innerHTML = `
    <input type="text" class="repo-url" value="" placeholder="仓库地址 (http://...)">
    <input type="text" class="repo-branch" value="" placeholder="分支">
    <input type="text" class="repo-group" value="" placeholder="分组">
    <button onclick="this.parentElement.remove()" title="删除">✕</button>
  `;
  list.appendChild(div);
}

async function saveAllSettings() {
  const token = document.getElementById('settingToken').value.trim();
  const author = document.getElementById('settingAuthor').value.trim();

  // 收集仓库列表
  const repos = [];
  document.querySelectorAll('#settingRepoList .setting-repo-row').forEach(row => {
    const url = row.querySelector('.repo-url').value.trim();
    const branch = row.querySelector('.repo-branch').value.trim();
    const group = row.querySelector('.repo-group').value.trim();
    if (url) repos.push({ repo: url, branch, group });
  });

  try {
    await API.post('/api/report/config', { token, author, outputDir: '', repos });
    // 同步更新周报模块的 repos
    rptRepos = repos.length ? repos.map(r => ({...r})) : [{ repo: '', branch: '', group: '' }];
    showToast('✅ 设置已保存');
  } catch (e) {
    showAlert('保存失败: ' + e.message, { icon: '❌' });
  }
}
