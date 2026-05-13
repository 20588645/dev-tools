// ===== 状态日志系统 =====
let sidecarReady = false;
const statusLogs = [];

function addStatusLog(text, type = 'info') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  statusLogs.push({ time, text, type });
  // 保留最近 200 条
  if (statusLogs.length > 200) statusLogs.shift();
  // 如果弹窗打开中，实时更新
  const logEl = document.getElementById('statusLog');
  if (logEl && document.getElementById('statusModal').classList.contains('active')) {
    const div = document.createElement('div');
    div.className = 'log-line log-' + type;
    div.textContent = `[${time}] ${text}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function updateStatusBadge(state) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot ' + state;
  if (state === 'online') text.textContent = '服务运行中';
  else if (state === 'offline') text.textContent = '服务离线';
  else text.textContent = '连接中...';
}

// ===== Sidecar 初始化 =====
async function initSidecar() {
  addStatusLog('正在初始化 API 连接...', 'info');
  updateStatusBadge('connecting');

  await initAPI();
  addStatusLog('API 基础地址: ' + API_BASE, 'info');

  try {
    const health = await API.get('/api/health');
    sidecarReady = true;
    addStatusLog('Sidecar 连接成功', 'success');
    addStatusLog('  PID: ' + health.pid, 'info');
    addStatusLog('  运行时间: ' + Math.round(health.uptime) + 's', 'info');
    addStatusLog('  状态: ' + health.status, 'success');
    updateStatusBadge('online');

    // 连接 WebSocket
    const port = API_BASE.split(':').pop();
    addStatusLog('正在连接 WebSocket (端口 ' + port + ')...', 'info');
    WS.connect(parseInt(port));

    // 监听 WS 连接状态
    const origOnOpen = WS.socket.onopen;
    WS.socket.onopen = function() {
      addStatusLog('WebSocket 已连接', 'success');
      if (origOnOpen) origOnOpen.call(this);
    };
  } catch (e) {
    addStatusLog('Sidecar 连接失败: ' + e.message, 'error');
    updateStatusBadge('offline');
    addStatusLog('3 秒后重试...', 'warn');
    setTimeout(initSidecar, 3000);
  }
}

// ===== 状态弹窗 =====
function openStatusModal() {
  document.getElementById('statusModal').classList.add('active');
  refreshStatus();
  renderStatusLog();
}

function closeStatusModal() {
  document.getElementById('statusModal').classList.remove('active');
}

function clearStatusLog() {
  statusLogs.length = 0;
  document.getElementById('statusLog').innerHTML = '<div class="log-line log-info">[日志已清空]</div>';
}

function renderStatusLog() {
  const logEl = document.getElementById('statusLog');
  if (statusLogs.length === 0) {
    logEl.innerHTML = '<div class="log-line log-info">暂无日志</div>';
    return;
  }
  logEl.innerHTML = statusLogs.map(l =>
    `<div class="log-line log-${l.type}">[${l.time}] ${l.text}</div>`
  ).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

async function refreshStatus() {
  // Tauri 主进程状态
  const tauriEl = document.getElementById('scTauriDetail');
  const tauriBadge = document.getElementById('scTauriBadge');
  if (window.__TAURI__) {
    tauriEl.textContent = '运行中 (Tauri WebView)';
    tauriBadge.textContent = '正常';
    tauriBadge.className = 'sc-badge ok';
  } else {
    tauriEl.textContent = '浏览器模式 (非 Tauri 环境)';
    tauriBadge.textContent = '浏览器';
    tauriBadge.className = 'sc-badge wait';
  }

  // Sidecar 状态
  const sidecarEl = document.getElementById('scSidecarDetail');
  const sidecarBadge = document.getElementById('scSidecarBadge');
  try {
    const health = await API.get('/api/health');
    sidecarEl.textContent = `PID ${health.pid} · 运行 ${Math.round(health.uptime)}s · 端口 ${API_BASE.split(':').pop()}`;
    sidecarBadge.textContent = '正常';
    sidecarBadge.className = 'sc-badge ok';
    updateStatusBadge('online');
    addStatusLog('状态刷新: Sidecar 正常', 'success');
  } catch (e) {
    sidecarEl.textContent = '无法连接: ' + e.message;
    sidecarBadge.textContent = '离线';
    sidecarBadge.className = 'sc-badge fail';
    updateStatusBadge('offline');
    addStatusLog('状态刷新: Sidecar 离线 - ' + e.message, 'error');
  }

  // WebSocket 状态
  const wsEl = document.getElementById('scWebSocketDetail');
  const wsBadge = document.getElementById('scWebSocketBadge');
  if (WS.socket && WS.socket.readyState === 1) {
    wsEl.textContent = '已连接 · ws://127.0.0.1:' + WS.port + '/ws';
    wsBadge.textContent = '已连接';
    wsBadge.className = 'sc-badge ok';
  } else if (WS.socket && WS.socket.readyState === 0) {
    wsEl.textContent = '正在连接...';
    wsBadge.textContent = '连接中';
    wsBadge.className = 'sc-badge wait';
  } else {
    wsEl.textContent = '未连接';
    wsBadge.textContent = '断开';
    wsBadge.className = 'sc-badge fail';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  addStatusLog('DevTools 应用启动', 'info');
  addStatusLog('环境: ' + (window.__TAURI__ ? 'Tauri Desktop' : 'Browser'), 'info');
  initSidecar();
});

// ===== Navigation =====
const navItems = document.querySelectorAll('.nav-item[data-page]');
const navSubItems = document.querySelectorAll('.nav-sub-item[data-page]');
const navGroups = document.querySelectorAll('.nav-group');
const pages = document.querySelectorAll('.page');
const breadcrumb = document.getElementById('breadcrumb');

const pageNames = {
  home: '首页',
  deploy: '部署面板',
  report: 'Git 周报',
  settings: '设置',
};

const subNames = {
  projects: '项目总览',
  servers: '服务器管理',
  history: '部署历史',
  generate: '生成周报',
  config: '仓库配置',
  quick: '快捷操作',
};

function navigateTo(page, sub) {
  // Update pages
  pages.forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  // Update nav active state
  navItems.forEach(item => item.classList.remove('active'));
  navSubItems.forEach(item => item.classList.remove('active'));

  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  if (sub) {
    const activeSub = document.querySelector(`.nav-sub-item[data-page="${page}"][data-sub="${sub}"]`);
    if (activeSub) activeSub.classList.add('active');
  }

  // Update breadcrumb
  let bc = pageNames[page] || page;
  if (sub && subNames[sub]) {
    bc = `${pageNames[page]} <span style="color:var(--text-muted);margin:0 6px">/</span> ${subNames[sub]}`;
  }
  breadcrumb.innerHTML = bc;
}

// Nav item clicks
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    const page = item.dataset.page;
    const sub = item.dataset.sub;
    navigateTo(page, sub);

    // Toggle nav group expand
    const group = item.closest('.nav-group');
    if (group) {
      group.classList.toggle('expanded');
    }
  });
});

// Sub nav clicks
navSubItems.forEach(item => {
  item.addEventListener('click', () => {
    navigateTo(item.dataset.page, item.dataset.sub);
  });
});

// ===== Sidebar Toggle =====
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleSidebar');

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ===== Search =====
const searchOverlay = document.getElementById('searchOverlay');
const searchTrigger = document.getElementById('searchTrigger');
const searchInput = document.getElementById('searchInput');

searchTrigger.addEventListener('click', () => {
  searchOverlay.classList.add('active');
  setTimeout(() => searchInput.focus(), 100);
});

searchOverlay.addEventListener('click', (e) => {
  if (e.target === searchOverlay) {
    searchOverlay.classList.remove('active');
  }
});

document.addEventListener('keydown', (e) => {
  // Cmd+K to open search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchOverlay.classList.add('active');
    setTimeout(() => searchInput.focus(), 100);
  }
  // ESC to close search
  if (e.key === 'Escape') {
    searchOverlay.classList.remove('active');
  }
  // Cmd+1 deploy
  if ((e.metaKey || e.ctrlKey) && e.key === '1') {
    e.preventDefault();
    navigateTo('deploy');
  }
  // Cmd+2 report
  if ((e.metaKey || e.ctrlKey) && e.key === '2') {
    e.preventDefault();
    navigateTo('report');
  }
});

// ===== Greeting =====
function updateGreeting() {
  const hour = new Date().getHours();
  let text = '晚上好 🌙';
  if (hour < 6) text = '夜深了 🌙';
  else if (hour < 12) text = '上午好 ☀️';
  else if (hour < 14) text = '中午好 🌤';
  else if (hour < 18) text = '下午好 👋';
  document.getElementById('greeting').textContent = text;
}
updateGreeting();

// ===== Filter Chips =====
document.querySelectorAll('.filter-chips').forEach(group => {
  group.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
});

// ===== 部署面板 - 动态数据 =====
let deployProjects = [];
let deployFilter = 'all';

async function loadDeployProjects() {
  if (!sidecarReady) return;
  try {
    deployProjects = await API.get('/api/projects');
    addStatusLog('加载项目列表: ' + deployProjects.length + ' 个项目', 'success');
    renderDeployProjects();
  } catch (e) {
    addStatusLog('加载项目失败: ' + e.message, 'error');
    document.getElementById('projectGrid').innerHTML =
      '<div style="text-align:center;color:var(--danger);padding:60px;grid-column:1/-1">加载失败: ' + e.message + '</div>';
  }
}

function renderDeployProjects() {
  const search = (document.getElementById('deploySearchInput')?.value || '').toLowerCase();
  let filtered = deployProjects.filter(p =>
    !search || p.name.toLowerCase().includes(search) || (p.displayName && p.displayName.toLowerCase().includes(search))
  );

  if (deployFilter === 'multi') filtered = filtered.filter(p => p.type === 'multi-module');
  else if (deployFilter === 'single') filtered = filtered.filter(p => p.type === 'single');

  const grid = document.getElementById('projectGrid');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px;grid-column:1/-1">暂无项目</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isMulti = p.type === 'multi-module';
    const moduleCount = (p.modules || []).length;
    const icon = isMulti ? '📦' : '📄';
    const badge = isMulti
      ? '<span class="badge badge-multi">多模块</span>'
      : '<span class="badge badge-single">单体</span>';
    const nodeLabel = p.nodeVersion ? `<span class="badge-tool">${p.nodeVersion}</span>` : '';
    const moduleCountLabel = isMulti ? `<span>${moduleCount} 个模块</span>` : '';

    const moduleTags = isMulti
      ? `<div class="project-card-modules">${(p.modules || []).slice(0, 4).map(m => `<span class="module-tag">${m.name}</span>`).join('')}${moduleCount > 4 ? `<span class="module-more">+${moduleCount - 4}</span>` : ''}</div>`
      : '<div class="project-card-modules"></div>';

    const serverIds = Array.isArray(p.defaultServerIds) && p.defaultServerIds.length > 0
      ? p.defaultServerIds
      : (p.defaultServerId ? [p.defaultServerId] : []);
    const statusHtml = serverIds.length > 0
      ? `<div class="project-card-status configured">● 已配置 ${serverIds.length} 台服务器</div>`
      : '<div class="project-card-status unconfigured">○ 未配置服务器</div>';

    return `
    <div class="project-card">
      <div class="project-card-top">
        <span class="project-name">${icon} ${p.displayName || p.name}</span>
        ${badge}
      </div>
      <div class="project-card-meta">
        <span class="badge-tool">${p.tool}</span>
        ${nodeLabel}
        ${moduleCountLabel}
      </div>
      ${moduleTags}
      ${statusHtml}
      <div class="project-card-actions">
        <button class="btn-card btn-build" onclick="doBuild('${p.name}')">🔨 构建</button>
        <button class="btn-card btn-deploy" onclick="doDeploy('${p.name}')">🚀 部署</button>
        <button class="btn-card btn-config" onclick="doConfig('${p.name}')">⚙</button>
      </div>
    </div>`;
  }).join('');
}

// 部署面板筛选器
document.addEventListener('click', (e) => {
  const chip = e.target.closest('#page-deploy .chip[data-filter]');
  if (!chip) return;
  document.querySelectorAll('#page-deploy .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  deployFilter = chip.dataset.filter;
  renderDeployProjects();
});

// 占位操作（后续完善弹窗交互）
function doBuild(name) { alert('构建: ' + name + '\n（完整弹窗交互将在后续实现）'); }
function doDeploy(name) { alert('部署: ' + name + '\n（完整弹窗交互将在后续实现）'); }
function doConfig(name) { alert('配置: ' + name + '\n（完整弹窗交互将在后续实现）'); }
function addProject() { alert('添加项目\n（完整弹窗交互将在后续实现）'); }

// ===== 首页 - 动态数据 =====
async function loadHomePage() {
  if (!sidecarReady) return;
  try {
    // 加载最近部署历史
    const history = await API.get('/api/history');
    renderHomeActivity(history.slice(0, 5));
    renderHomeStats(history);
  } catch (e) {
    // 静默失败，首页保持 mockup 数据
  }
}

function renderHomeActivity(records) {
  const el = document.querySelector('.activity-list');
  if (!el || records.length === 0) return;

  el.innerHTML = records.map(h => {
    const isSuccess = h.status === 'success';
    const cls = isSuccess ? 'success' : 'fail';
    const icon = isSuccess ? '✅' : '❌';
    const typeLabel = h.type === 'deploy' ? '部署' : '构建';
    const statusLabel = isSuccess ? typeLabel + '成功' : typeLabel + '失败';
    const modules = (h.modules || []).join(', ');
    const meta = h.type === 'deploy' ? `→ ${h.serverName} · ${modules}` : modules;
    const time = new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    return `
    <div class="activity-item ${cls}">
      <div class="activity-dot"></div>
      <div class="activity-info">
        <span class="activity-text">${statusLabel} — ${h.projectName} / ${modules}</span>
        <span class="activity-meta">${meta} · ${h.duration || ''}</span>
      </div>
      <div class="activity-time">${time}</div>
    </div>`;
  }).join('');
}

function renderHomeStats(history) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = history.filter(h => new Date(h.timestamp).getTime() > weekAgo);
  const successCount = thisWeek.filter(h => h.status === 'success').length;
  const total = thisWeek.length;
  const rate = total > 0 ? Math.round(successCount / total * 100) : 0;

  const stats = document.querySelectorAll('.stat-card');
  if (stats.length >= 4) {
    stats[0].querySelector('.stat-value').textContent = total;
    stats[1].querySelector('.stat-value').textContent = rate + '%';
    stats[2].querySelector('.stat-value').textContent = deployProjects.length;
  }
}

// ===== 页面切换时加载数据 =====
const origNavigateTo = navigateTo;
navigateTo = function(page, sub) {
  origNavigateTo(page, sub);
  if (page === 'deploy' && sidecarReady) loadDeployProjects();
  if (page === 'home' && sidecarReady) loadHomePage();
};

// 初始化完成后加载数据
const origInitSidecar = initSidecar;
initSidecar = async function() {
  await origInitSidecar();
  if (sidecarReady) {
    loadDeployProjects();
    loadHomePage();
  }
};

// ===== 构建/部署弹窗逻辑 =====
let currentBuildProject = null;
let currentDeployProject = null;
let buildCheckedModules = new Set();
let deployCheckedModules = new Set();
let nodeVersions = [];
let servers = [];
let currentDeployId = null;
let buildModuleFilter = 'all';

// 模块收藏（localStorage 持久化）
function getFavorites(projectName) {
  try { return JSON.parse(localStorage.getItem('fav_' + projectName) || '[]'); } catch { return []; }
}
function saveFavorites(projectName, favs) {
  localStorage.setItem('fav_' + projectName, JSON.stringify(favs));
}
function toggleFav(projectName, moduleName, e) {
  if (e) e.stopPropagation();
  const favs = getFavorites(projectName);
  const idx = favs.indexOf(moduleName);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(moduleName);
  saveFavorites(projectName, favs);
  renderBuildModules(currentBuildProject.modules || []);
}

function setBuildFilter(mode, btn) {
  buildModuleFilter = mode;
  document.querySelectorAll('#buildModal .module-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBuildModules(currentBuildProject.modules || []);
}

async function loadNodeVersions() {
  try {
    const data = await API.get('/api/projects/node-versions/list');
    nodeVersions = data.versions || [];
  } catch (e) { /* ignore */ }
}

async function loadServers() {
  try {
    servers = await API.get('/api/servers');
  } catch (e) { /* ignore */ }
}

// ===== 构建弹窗 =====
async function doBuild(name) {
  const project = deployProjects.find(p => p.name === name);
  if (!project) return;
  currentBuildProject = project;
  buildCheckedModules.clear();

  await loadNodeVersions();

  document.getElementById('buildModalTitle').textContent = '构建 — ' + (project.displayName || project.name);
  const isMulti = project.type === 'multi-module';
  document.getElementById('buildModalSub').textContent = isMulti
    ? `多模块项目 · ${(project.modules || []).length} 个模块`
    : `单体项目 · ${project.tool}`;

  document.getElementById('buildSingleView').style.display = isMulti ? 'none' : 'block';
  document.getElementById('buildMultiView').style.display = isMulti ? 'block' : 'none';

  if (isMulti) {
    renderBuildModules(project.modules || []);
  }

  // Node 版本下拉
  const nodeSelect = document.getElementById('buildNodeSelect');
  nodeSelect.innerHTML = '<option value="">系统默认 (' + (nodeVersions[0] || process?.version || '') + ')</option>'
    + nodeVersions.map(v => `<option value="${v}" ${v === (project.nodeVersion || '') ? 'selected' : ''}>${v}</option>`).join('');

  document.getElementById('buildModal').classList.add('active');
}

function renderBuildModules(modules) {
  const favs = getFavorites(currentBuildProject.name);
  let filtered = modules;
  if (buildModuleFilter === 'fav') {
    filtered = modules.filter(m => favs.includes(m.name));
  }
  const grid = document.getElementById('buildModuleGrid');
  if (filtered.length === 0 && buildModuleFilter === 'fav') {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;grid-column:1/-1;font-size:12px">暂无常用模块，点击模块右侧 ☆ 添加</div>';
  } else {
    grid.innerHTML = filtered.map(m => {
      const isFav = favs.includes(m.name);
      return `
      <div class="module-select-item ${buildCheckedModules.has(m.name) ? 'checked' : ''}" onclick="toggleBuildModule('${m.name}')">
        <span class="msi-check">${buildCheckedModules.has(m.name) ? '✓' : ''}</span>
        <span>${m.name}</span>
        <span class="msi-fav ${isFav ? 'active' : ''}" onclick="toggleFav('${currentBuildProject.name}','${m.name}',event)">${isFav ? '★' : '☆'}</span>
      </div>`;
    }).join('');
  }
  document.getElementById('buildSelectedCount').textContent = '已选 ' + buildCheckedModules.size + ' 个';
}

function toggleBuildModule(name) {
  buildCheckedModules.has(name) ? buildCheckedModules.delete(name) : buildCheckedModules.add(name);
  renderBuildModules(currentBuildProject.modules || []);
}

function toggleAllBuildModules(check) {
  if (check) (currentBuildProject.modules || []).forEach(m => buildCheckedModules.add(m.name));
  else buildCheckedModules.clear();
  renderBuildModules(currentBuildProject.modules || []);
}

function closeBuildModal() {
  document.getElementById('buildModal').classList.remove('active');
}

async function executeBuild() {
  const project = currentBuildProject;
  if (!project) return;

  if (project.type === 'multi-module' && buildCheckedModules.size === 0) {
    alert('请至少选择一个模块');
    return;
  }

  const modules = project.type === 'multi-module' ? [...buildCheckedModules] : [];
  const nodeVersion = document.getElementById('buildNodeSelect').value;

  closeBuildModal();
  openLogModal('构建进度', project.name + ' · ' + (modules.length ? modules.join(', ') : '整体构建'), true);

  try {
    const data = await API.post('/api/deploy/build', {
      projectName: project.name,
      modules,
      nodeVersion,
    });
    currentDeployId = data.id;
    // 回放缓存的日志
    pendingLogs.forEach(log => {
      if (log.id === currentDeployId) appendDeployLog(log.text, log.type);
    });
    pendingLogs = [];
    addStatusLog('构建任务已启动: ' + data.id, 'info');
  } catch (e) {
    appendDeployLog('请求失败: ' + e.message, 'error');
    addStatusLog('构建请求失败: ' + e.message, 'error');
  }
}

// ===== 部署弹窗 =====
async function doDeploy(name) {
  const project = deployProjects.find(p => p.name === name);
  if (!project) return;
  currentDeployProject = project;
  deployCheckedModules.clear();

  await Promise.all([loadNodeVersions(), loadServers()]);

  document.getElementById('deployModalTitle').textContent = '部署 — ' + (project.displayName || project.name);
  const isMulti = project.type === 'multi-module';
  document.getElementById('deployModalSub').textContent = isMulti
    ? `多模块项目 · ${(project.modules || []).length} 个模块`
    : `单体项目 · ${project.tool}`;

  document.getElementById('deploySingleView').style.display = isMulti ? 'none' : 'block';
  document.getElementById('deployMultiView').style.display = isMulti ? 'block' : 'none';

  if (isMulti) {
    renderDeployModules(project.modules || []);
  }

  // Node 版本下拉
  const nodeSelect = document.getElementById('deployNodeSelect');
  nodeSelect.innerHTML = '<option value="">系统默认</option>'
    + nodeVersions.map(v => `<option value="${v}" ${v === (project.nodeVersion || '') ? 'selected' : ''}>${v}</option>`).join('');

  // 服务器下拉
  const serverSelect = document.getElementById('deployServerSelect');
  const defaultIds = Array.isArray(project.defaultServerIds) ? project.defaultServerIds : (project.defaultServerId ? [project.defaultServerId] : []);
  serverSelect.innerHTML = servers.map(s =>
    `<option value="${s.id}" ${defaultIds.includes(s.id) ? 'selected' : ''}>${s.name} (${s.host})</option>`
  ).join('');

  // 发布目录下拉
  populateDeployPaths();
  serverSelect.onchange = populateDeployPaths;

  document.getElementById('deployModal').classList.add('active');
}

function populateDeployPaths() {
  const serverId = document.getElementById('deployServerSelect').value;
  const server = servers.find(s => s.id === serverId);
  const pathSelect = document.getElementById('deployPathSelect');

  if (!server) {
    pathSelect.innerHTML = '<option value="/">/</option>';
    return;
  }

  const paths = Array.isArray(server.deployPaths) && server.deployPaths.length > 0
    ? server.deployPaths
    : [server.defaultRemotePath || '/'];

  pathSelect.innerHTML = paths.map((p, i) =>
    `<option value="${p}">${p}${i === 0 ? ' (默认)' : ''}</option>`
  ).join('');
}

function renderDeployModules(modules) {
  const grid = document.getElementById('deployModuleGrid');
  grid.innerHTML = modules.map(m => `
    <div class="module-select-item ${deployCheckedModules.has(m.name) ? 'checked' : ''}" onclick="toggleDeployModule('${m.name}')">
      <span class="msi-check">${deployCheckedModules.has(m.name) ? '✓' : ''}</span>
      <span>${m.name}</span>
    </div>
  `).join('');
  document.getElementById('deploySelectedCount').textContent = '已选 ' + deployCheckedModules.size + ' 个';
}

function toggleDeployModule(name) {
  deployCheckedModules.has(name) ? deployCheckedModules.delete(name) : deployCheckedModules.add(name);
  renderDeployModules(currentDeployProject.modules || []);
}

function toggleAllDeployModules(check) {
  if (check) (currentDeployProject.modules || []).forEach(m => deployCheckedModules.add(m.name));
  else deployCheckedModules.clear();
  renderDeployModules(currentDeployProject.modules || []);
}

function closeDeployModal() {
  document.getElementById('deployModal').classList.remove('active');
}

async function executeDeploy() {
  const project = currentDeployProject;
  if (!project) return;

  if (project.type === 'multi-module' && deployCheckedModules.size === 0) {
    alert('请至少选择一个模块');
    return;
  }

  const serverId = document.getElementById('deployServerSelect').value;
  if (!serverId) { alert('请选择目标服务器'); return; }

  const modules = project.type === 'multi-module' ? [...deployCheckedModules] : [];
  const nodeVersion = document.getElementById('deployNodeSelect').value;
  const remotePath = document.getElementById('deployPathSelect').value;

  closeDeployModal();
  openLogModal('部署进度', project.name + ' · ' + (modules.length ? modules.join(', ') : '整体构建'), false);

  try {
    const data = await API.post('/api/deploy/start', {
      projectName: project.name,
      modules,
      serverIds: [serverId],
      serverId,
      remotePath,
      nodeVersion,
    });
    currentDeployId = data.id;
    // 回放缓存的日志
    pendingLogs.forEach(log => {
      if (log.id === currentDeployId) appendDeployLog(log.text, log.type);
    });
    pendingLogs = [];
    addStatusLog('部署任务已启动: ' + data.id, 'info');
  } catch (e) {
    appendDeployLog('请求失败: ' + e.message, 'error');
    addStatusLog('部署请求失败: ' + e.message, 'error');
  }
}

// ===== 实时日志弹窗 =====
function openLogModal(title, subtitle, isBuildOnly) {
  document.getElementById('logModalTitle').textContent = title;
  document.getElementById('logModalSub').textContent = subtitle;
  document.getElementById('deployLog').innerHTML = '';
  document.getElementById('logProgressBar').style.width = '0%';
  document.getElementById('logProgressText').textContent = '0%';
  document.getElementById('logResult').style.display = 'none';

  // 阶段步骤
  const steps = isBuildOnly
    ? ['拉取代码', '构建中']
    : ['预检', '拉取代码', '构建中', '上传中'];
  document.getElementById('logSteps').innerHTML = steps.map((s, i) =>
    `<div class="log-step${i === 0 ? ' active' : ''}" id="logStep${i}"><span class="log-step-dot"></span>${s}</div>`
  ).join('');

  document.getElementById('logModal').classList.add('active');
}

function closeLogModal() {
  document.getElementById('logModal').classList.remove('active');
  currentDeployId = null;
}

function appendDeployLog(text, type = 'info') {
  const terminal = document.getElementById('deployLog');
  if (!terminal) return;
  const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
  const div = document.createElement('div');
  div.className = 'log-line log-' + type;
  div.textContent = clean;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

// WebSocket 日志监听
let pendingLogs = []; // 缓存 deployId 确认前的日志

function setupDeployWSHandlers() {
  WS.on('log', (data) => {
    // 如果还没拿到 deployId，先缓存
    if (!currentDeployId) {
      pendingLogs.push(data);
      return;
    }
    if (data.id !== currentDeployId) return;
    appendDeployLog(data.text, data.type);
  });

  WS.on('progress', (data) => {
    if (data.id !== currentDeployId) return;
    const pct = data.percent || 0;
    document.getElementById('logProgressBar').style.width = pct + '%';
    document.getElementById('logProgressText').textContent = pct + '%';
  });

  WS.on('status', (data) => {
    if (data.id !== currentDeployId) return;

    // 更新阶段步骤指示器
    const phaseMap = { preflight: 0, pulling: 1, building: 2, uploading: 3 };
    const buildPhaseMap = { pulling: 0, building: 1 };
    const isBuild = data.id && data.id.startsWith('build-');
    const map = isBuild ? buildPhaseMap : phaseMap;

    if (data.phase && data.phase !== 'done') {
      const activeIdx = map[data.phase] ?? 0;
      document.querySelectorAll('.log-step').forEach((el, i) => {
        el.classList.remove('active', 'done');
        if (i < activeIdx) el.classList.add('done');
        else if (i === activeIdx) el.classList.add('active');
      });
    }

    if (data.phase === 'done') {
      document.querySelectorAll('.log-step').forEach(el => {
        el.classList.remove('active');
        el.classList.add('done');
      });
      document.getElementById('logProgressBar').style.width = '100%';
      document.getElementById('logProgressText').textContent = '100%';
      const result = document.getElementById('logResult');
      result.style.display = 'block';
      if (data.status === 'success') {
        const label = data.type === 'build-only' ? '构建完成' : '部署完成';
        document.getElementById('logResultIcon').textContent = '✅';
        document.getElementById('logResultText').textContent = `${label}！耗时 ${data.duration}`;
      } else {
        const label = data.type === 'build-only' ? '构建失败' : '部署失败';
        document.getElementById('logResultIcon').textContent = '❌';
        document.getElementById('logResultText').textContent = label;
      }
      addStatusLog(`任务完成: ${data.projectName} - ${data.status}`, data.status === 'success' ? 'success' : 'error');
      loadDeployProjects();
      loadHomePage();
    }
  });
}

// 在 WS 连接后设置监听
const origWSConnect = WS.connect.bind(WS);
WS.connect = function(port) {
  origWSConnect(port);
  // 等连接建立后注册处理器
  setTimeout(setupDeployWSHandlers, 500);
};

// ===== 服务器管理页面 =====
async function loadServerList() {
  if (!sidecarReady) return;
  try {
    servers = await API.get('/api/servers');
    renderServerList();
  } catch (e) {
    document.getElementById('serverList').innerHTML =
      '<div style="text-align:center;color:var(--danger);padding:60px">加载失败: ' + e.message + '</div>';
  }
}

function renderServerList() {
  const list = document.getElementById('serverList');
  if (!list) return;
  if (servers.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无服务器，点击「+ 添加服务器」按钮</div>';
    return;
  }
  list.innerHTML = servers.map(s => `
    <div class="server-card">
      <div class="server-card-info">
        <div class="server-card-icon">🖥</div>
        <div>
          <div class="server-card-name">${s.name}</div>
          <div class="server-card-host">${s.username}@${s.host}:${s.port} → ${s.defaultRemotePath || '/'}</div>
        </div>
      </div>
      <div class="server-card-actions">
        <button title="测试连接" onclick="testServerConn('${s.id}')">⚡</button>
        <button title="编辑" onclick="editServer('${s.id}')">✎</button>
        <button class="danger" title="删除" onclick="deleteServer('${s.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function showAddServer() { alert('添加服务器\n（完整表单弹窗将在后续实现）'); }
function editServer(id) { alert('编辑服务器: ' + id + '\n（完整表单弹窗将在后续实现）'); }

async function deleteServer(id) {
  if (!confirm('确定删除该服务器？')) return;
  try {
    await API.del('/api/servers/' + id);
    await loadServerList();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

async function testServerConn(id) {
  const server = servers.find(s => s.id === id);
  if (!server) return;
  openLogModal('连接测试', server.name + ' (' + server.host + ')', true);
  try {
    const data = await API.post('/api/servers/' + id + '/test');
    currentDeployId = data.id;
    pendingLogs.forEach(log => {
      if (log.id === currentDeployId) appendDeployLog(log.text, log.type);
    });
    pendingLogs = [];
  } catch (e) {
    appendDeployLog('测试失败: ' + e.message, 'error');
  }
}

// ===== 部署历史页面 =====
let historyData = [];
let historyFilter = 'all';

async function loadHistory() {
  if (!sidecarReady) return;
  try {
    historyData = await API.get('/api/history');
    renderHistory();
  } catch (e) {
    document.getElementById('historyTable').innerHTML =
      '<div style="text-align:center;color:var(--danger);padding:60px">加载失败: ' + e.message + '</div>';
  }
}

function renderHistory() {
  const table = document.getElementById('historyTable');
  if (!table) return;

  let filtered = historyData;
  if (historyFilter !== 'all') filtered = filtered.filter(h => h.type === historyFilter);

  if (filtered.length === 0) {
    table.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无部署记录</div>';
    return;
  }

  table.innerHTML = `
    <div class="history-row header">
      <div>时间</div>
      <div>项目</div>
      <div>类型</div>
      <div>模块</div>
      <div>状态</div>
      <div>操作</div>
    </div>
    ${filtered.map(h => {
      const time = new Date(h.timestamp).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      const typeLabel = h.type === 'deploy' ? '🚀 部署' : '🔨 构建';
      const statusCls = h.status === 'success' ? 'h-status-success' : 'h-status-fail';
      const statusText = h.status === 'success' ? '✅ ' + (h.duration || '') : '❌ 失败';
      const modules = (h.modules || []).slice(0, 3).map(m => '<span class="module-tag">' + m + '</span>').join('');
      const more = (h.modules || []).length > 3 ? '<span class="module-more">+' + ((h.modules || []).length - 3) + '</span>' : '';
      return `
      <div class="history-row">
        <div style="color:var(--text-muted)">${time}</div>
        <div>${h.projectName}</div>
        <div>${typeLabel}</div>
        <div class="h-modules">${modules}${more}</div>
        <div class="${statusCls}">${statusText}</div>
        <div class="h-actions">
          <button onclick="viewHistoryLog('${h.id}')" title="查看日志">📋</button>
          <button onclick="deleteHistory('${h.id}')" title="删除">🗑</button>
        </div>
      </div>`;
    }).join('')}
  `;
}

// 历史筛选
document.addEventListener('click', (e) => {
  const chip = e.target.closest('#page-history .chip[data-hfilter]');
  if (!chip) return;
  document.querySelectorAll('#page-history .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  historyFilter = chip.dataset.hfilter;
  renderHistory();
});

async function viewHistoryLog(id) {
  try {
    const record = await API.get('/api/history/' + id);
    openLogModal('部署日志', record.projectName + ' · ' + (record.modules || []).join(', '), record.type === 'build-only');
    document.getElementById('logProgressBar').style.width = '100%';
    document.getElementById('logProgressText').textContent = '100%';
    // 渲染所有步骤为完成态
    document.querySelectorAll('.log-step').forEach(el => { el.classList.remove('active'); el.classList.add('done'); });
    // 渲染日志
    (record.logs || []).forEach(l => appendDeployLog(l.text, l.type));
    // 显示结果
    const result = document.getElementById('logResult');
    result.style.display = 'block';
    document.getElementById('logResultIcon').textContent = record.status === 'success' ? '✅' : '❌';
    document.getElementById('logResultText').textContent = record.status === 'success'
      ? `完成！耗时 ${record.duration}` : '失败';
  } catch (e) {
    alert('加载日志失败: ' + e.message);
  }
}

async function deleteHistory(id) {
  if (!confirm('确认删除这条记录？')) return;
  try {
    await API.del('/api/history/' + id);
    historyData = historyData.filter(h => h.id !== id);
    renderHistory();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// ===== 更新页面切换逻辑，加载对应数据 =====
const origNavigateTo2 = navigateTo;
navigateTo = function(page, sub) {
  origNavigateTo2(page, sub);
  if (page === 'deploy' && sub === 'servers' && sidecarReady) {
    // 显示服务器管理页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-servers').classList.add('active');
    loadServerList();
  } else if (page === 'deploy' && sub === 'history' && sidecarReady) {
    // 显示部署历史页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-history').classList.add('active');
    loadHistory();
  }
};

// ===== Git 周报功能 =====
let reportConfig = { token: '', author: '', repos: [] };
let reportResults = [];

async function loadReportConfig() {
  if (!sidecarReady) return;
  try {
    reportConfig = await API.get('/api/report/config');
    renderReportRepos();
  } catch (e) {
    addStatusLog('加载周报配置失败: ' + e.message, 'error');
  }
}

function renderReportRepos() {
  const list = document.getElementById('reportRepoList');
  if (!list) return;
  if (!reportConfig.repos || reportConfig.repos.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">暂无仓库配置，请在设置中添加</div>';
    return;
  }
  list.innerHTML = reportConfig.repos.map((r, i) => {
    const name = r.repo.split('/').pop().replace('.git', '');
    return `
    <div class="repo-item checked">
      <input type="checkbox" checked data-idx="${i}">
      <div class="repo-info">
        <span class="repo-name">${name}</span>
        <span class="repo-branch">${r.branch || 'default'}</span>
      </div>
      <span class="repo-group">${r.group || ''}</span>
    </div>`;
  }).join('');
}

async function generateReport() {
  const since = document.getElementById('reportSince').value;
  const until = document.getElementById('reportUntil').value;
  if (!since || !until) { alert('请选择时间范围'); return; }
  if (!reportConfig.token) { alert('请先在设置中配置 GitLab Token'); return; }

  // 获取选中的仓库
  const checkboxes = document.querySelectorAll('#reportRepoList input[type="checkbox"]');
  const selectedRepos = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selectedRepos.push(reportConfig.repos[parseInt(cb.dataset.idx)]);
  });

  if (selectedRepos.length === 0) { alert('请至少选择一个仓库'); return; }

  const preview = document.getElementById('reportPreviewContent');
  preview.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:24px;margin-bottom:8px">⏳</div>正在生成周报...</div>';

  try {
    const data = await API.post('/api/report/generate', {
      token: reportConfig.token,
      author: reportConfig.author,
      since,
      until,
      repos: selectedRepos,
    });
    reportResults = data.results || [];
    renderReportPreview(reportResults);
    addStatusLog('周报生成完成: ' + reportResults.length + ' 个仓库', 'success');
  } catch (e) {
    preview.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger)">生成失败: ' + e.message + '</div>';
    addStatusLog('周报生成失败: ' + e.message, 'error');
  }
}

function renderReportPreview(results) {
  const preview = document.getElementById('reportPreviewContent');
  if (results.length === 0) {
    preview.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">无数据</div>';
    return;
  }

  const totalCommits = results.reduce((sum, r) => sum + r.logs.length, 0);

  let html = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">共 ${results.length} 个仓库，${totalCommits} 条提交</div>`;

  for (const item of results) {
    if (item.error) {
      html += `<div class="preview-group"><div class="preview-group-header"><span class="preview-group-name">${item.group ? item.group + ' / ' : ''}${item.project}</span><span style="color:var(--danger);font-size:12px">获取失败: ${item.error}</span></div></div>`;
      continue;
    }
    if (item.logs.length === 0) {
      html += `<div class="preview-group"><div class="preview-group-header"><span class="preview-group-name">${item.group ? item.group + ' / ' : ''}${item.project}</span><span class="preview-group-branch">${item.branch || ''}</span><span class="preview-group-count">无提交</span></div></div>`;
      continue;
    }

    // 按日期分组
    const byDate = {};
    for (const log of item.logs) {
      if (!byDate[log.date]) byDate[log.date] = [];
      byDate[log.date].push(log);
    }

    html += `<div class="preview-group">
      <div class="preview-group-header">
        <span class="preview-group-name">${item.group ? item.group + ' / ' : ''}${item.project}</span>
        <span class="preview-group-branch">${item.branch || ''}</span>
        <span class="preview-group-count">${item.logs.length} 条提交</span>
      </div>
      <div class="preview-table">`;

    for (const [date, logs] of Object.entries(byDate)) {
      const d = new Date(date);
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const wd = weekdays[d.getDay()];

      html += `<div class="preview-row">
        <span class="preview-date">${date.slice(5)}</span>
        <span class="preview-weekday">${wd}</span>
        <span class="preview-commits">`;

      for (const log of logs) {
        const tag = parseCommitTag(log.subject);
        html += `<span class="commit-item">${tag}<span>${escapeHtml(log.subject.replace(/^(feat|fix|refactor|style|chore|docs|perf|test)(\([^)]*\))?:\s*/i, ''))}</span></span>`;
      }

      html += `</span></div>`;
    }

    html += `</div></div>`;
  }

  preview.innerHTML = html;
}

function parseCommitTag(subject) {
  const match = subject.match(/^(feat|fix|refactor|style|chore|docs|perf|test)/i);
  if (!match) return '';
  const type = match[1].toUpperCase();
  const tagMap = {
    FEAT: 'tag-feat', FIX: 'tag-fix', REFACTOR: 'tag-refactor',
    STYLE: 'tag-style', CHORE: 'tag-chore', DOCS: 'tag-docs',
    PERF: 'tag-perf', TEST: 'tag-test',
  };
  return `<span class="commit-tag ${tagMap[type] || ''}">${type}</span>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyReportMarkdown() {
  if (reportResults.length === 0) { alert('请先生成周报'); return; }
  const since = document.getElementById('reportSince').value;
  const until = document.getElementById('reportUntil').value;
  // 简单生成 markdown
  let md = `# Git 周报 (${since} ~ ${until})\n\n`;
  for (const item of reportResults) {
    if (item.error || item.logs.length === 0) continue;
    md += `## ${item.group ? item.group + ' / ' : ''}${item.project}\n\n`;
    for (const log of item.logs) {
      md += `- [${log.date}] ${log.subject}\n`;
    }
    md += '\n';
  }
  navigator.clipboard.writeText(md).then(() => alert('已复制到剪贴板'));
}

// 设置默认日期范围（本周一到本周五）
function setDefaultDateRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = d => d.toISOString().slice(0, 10);
  const sinceEl = document.getElementById('reportSince');
  const untilEl = document.getElementById('reportUntil');
  if (sinceEl) sinceEl.value = fmt(monday);
  if (untilEl) untilEl.value = fmt(friday);
}

// 页面切换时加载周报数据
const origNavigateTo3 = navigateTo;
navigateTo = function(page, sub) {
  origNavigateTo3(page, sub);
  if (page === 'report' && sidecarReady) {
    loadReportConfig();
    setDefaultDateRange();
  }
};

// ===== 设置页 =====
async function loadSettings() {
  if (!sidecarReady) return;
  try {
    const cfg = await API.get('/api/report/config');
    document.getElementById('settingToken').value = cfg.token || '';
    document.getElementById('settingAuthor').value = cfg.author || '';
    renderSettingRepos(cfg.repos || []);
    document.getElementById('settingAbout').textContent = 'Sidecar PID: ' + (await API.get('/api/health')).pid;
  } catch (e) { /* ignore */ }
}

function renderSettingRepos(repos) {
  const list = document.getElementById('settingRepoList');
  if (repos.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px">暂无仓库，点击「+ 添加仓库」</div>';
    return;
  }
  list.innerHTML = repos.map((r, i) => `
    <div class="repo-row" data-idx="${i}">
      <input type="text" class="repo-url" value="${r.repo || ''}" placeholder="仓库地址 (http://...)">
      <input type="text" class="repo-branch" value="${r.branch || ''}" placeholder="分支">
      <input type="text" class="repo-group" value="${r.group || ''}" placeholder="分组">
      <button onclick="removeRepoRow(${i})" title="删除">✕</button>
    </div>
  `).join('');
}

function addRepoRow() {
  const list = document.getElementById('settingRepoList');
  const rows = list.querySelectorAll('.repo-row');
  const idx = rows.length;
  const div = document.createElement('div');
  div.className = 'repo-row';
  div.dataset.idx = idx;
  div.innerHTML = `
    <input type="text" class="repo-url" value="" placeholder="仓库地址 (http://...)">
    <input type="text" class="repo-branch" value="" placeholder="分支">
    <input type="text" class="repo-group" value="" placeholder="分组">
    <button onclick="this.parentElement.remove()" title="删除">✕</button>
  `;
  list.appendChild(div);
}

function removeRepoRow(idx) {
  const rows = document.querySelectorAll('#settingRepoList .repo-row');
  if (rows[idx]) rows[idx].remove();
}

async function saveSettings() {
  const token = document.getElementById('settingToken').value.trim();
  const author = document.getElementById('settingAuthor').value.trim();

  // 收集仓库列表
  const repos = [];
  document.querySelectorAll('#settingRepoList .repo-row').forEach(row => {
    const url = row.querySelector('.repo-url').value.trim();
    const branch = row.querySelector('.repo-branch').value.trim();
    const group = row.querySelector('.repo-group').value.trim();
    if (url) repos.push({ repo: url, branch, group });
  });

  try {
    await API.post('/api/report/config', { token, author, outputDir: '', repos });
    reportConfig = { token, author, repos };
    showToast('✅ 设置已保存');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message, 'error');
  }
}

// ===== Toast 通知 =====
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== 首页快捷操作连接真实数据 =====
async function loadHomeQuickActions() {
  if (!sidecarReady) return;
  try {
    const history = await API.get('/api/history');
    const lastDeploy = history.find(h => h.type === 'deploy' && h.status === 'success');
    if (lastDeploy) {
      const card = document.querySelector('.quick-card:first-child');
      if (card) {
        const desc = card.querySelector('.quick-card-desc');
        const meta = card.querySelector('.quick-card-meta');
        if (desc) desc.textContent = lastDeploy.projectName + ' / ' + (lastDeploy.modules || []).join(', ') + ' → ' + (lastDeploy.serverName || '');
        if (meta) meta.textContent = timeAgoSimple(lastDeploy.timestamp) + ' · ' + (lastDeploy.duration || '');
      }
    }
  } catch (e) { /* ignore */ }
}

function timeAgoSimple(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + '分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '小时前';
  return Math.floor(h / 24) + '天前';
}

// 更新页面切换逻辑
const origNavigateTo4 = navigateTo;
navigateTo = function(page, sub) {
  origNavigateTo4(page, sub);
  if (page === 'settings' && sidecarReady) loadSettings();
  if (page === 'home' && sidecarReady) loadHomeQuickActions();
};

// ===== 快捷键增强 =====
document.addEventListener('keydown', (e) => {
  // Cmd+, 打开设置
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    navigateTo('settings');
  }
});
