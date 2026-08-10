// ========== Module: Deploy (部署面板) ==========

// ========== Node Versions ==========
async function loadNodeVersions() {
  try {
    const data = await API.get('/api/projects/node-versions/list');
    nodeVersions = data.versions || [];
    currentNodeVersion = data.current || '';
  } catch (e) {
    console.error('加载 Node 版本失败:', e);
    // 不静默失败：兜底空列表（各处版本下拉仍能用"系统默认"，不至于崩），并 toast 告知此次拿不到可选版本
    nodeVersions = [];
    showToast('加载 Node 版本列表失败', (e.message || '稍后重试') + '，当前仅可用系统默认版本');
  }
}

// ========== Dashboard ==========
/*
  只保留取数：`projects` 仍是构建/部署弹窗与项目默认配置弹窗的数据源，等第 6 步
  弹窗迁完可一并删除。运行态对账、托盘菜单与首页刷新已由 Vue 的 run store +
  run-runtime-service 承担；三个子页的失败态也各自由 Vue 侧渲染。
*/
async function loadProjects() {
  try {
    projects = await API.get('/api/projects');
  } catch (e) {
    console.error('加载项目失败:', e);
  }
}

/*
  项目总览（搜索/筛选/分组卡片）整体由 Vue 接管，见
  `views/deploy/DeployDashboardView.vue`。分组的折叠态与排序偏好改由
  `composables/use-project-groups.ts` 读写，键名不变，故用户已有偏好沿用。
  本文件只保留服务器管理、部署历史与各类弹窗的 legacy 逻辑。
*/

async function removeProject(name) {
  if (!await showConfirm(`确定移除项目「${name}」？（仅从面板中移除，不会删除源码）`, { icon: '🗑️', danger: true, confirmText: '移除' })) return;
  try {
    await API.del(`/api/projects/${name}`);
    await loadProjects();
  } catch (e) {
    showAlert('移除失败: ' + e.message, { icon: '❌' });
  }
}

/*
  项目默认配置弹窗已迁到 Vue：`views/deploy/components/ProjectConfigDialog.vue` +
  `composables/useProjectConfig.ts`，由项目总览子页的卡片直接打开。
  原 `configProjectName` / `configCheckedServers` 两个模块级变量随之退役——它们
  是「关掉弹窗再开另一个项目仍残留上次勾选」的来源，Vue 侧状态随组件私有化。
*/

/**
 * 默认目标服务器：数组字段优先，为空时回落到单值字段。
 *
 * 仍留在 legacy 侧供部署弹窗（第 4 批）使用；Vue 侧的等价实现是
 * `project-service.ts` 的 `projectDefaultServerIds`。
 */
function getProjectDefaultServerIds(project) {
  if (Array.isArray(project.defaultServerIds) && project.defaultServerIds.length > 0) {
    return project.defaultServerIds;
  }
  return project.defaultServerId ? [project.defaultServerId] : [];
}

/*
  添加项目弹窗已迁到 Vue：`views/deploy/components/AddProjectDialog.vue` +
  `composables/useAddProject.ts`。弹窗随 `MigrationHost` 常驻而非挂在项目总览
  子页内——触发它的「+ 添加项目」按钮在部署页头、三个子页共用，而子页在
  KeepAlive 下会 deactivated。页头的 `onclick="showAddProject()"` 由
  `legacy/add-project-bridge.ts` 转发，页头迁入 Vue 后该桥即可删除。

  原 `currentAddMode` / `checkedBrowseProjects` 两个模块级变量与 `app.js` 的
  `availableProjects` / `checkedAvailableProjects` 两个全局随之退役。
*/

// ========== Module Select Modal ==========
const modalState = {
  build: { checkedModules: new Set(), moduleFilter: 'all' },
  deploy: { checkedModules: new Set(), moduleFilter: 'all' },
};
let activeCtx = 'deploy';

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

  const nodeSelect = document.getElementById(`${prefix}NodeVersion`);
  const projectNode = currentProject.nodeVersion || '';
  nodeSelect.innerHTML = `<option value="">系统默认 (${escapeHtml(currentNodeVersion)})</option>`
    + nodeVersions.map(v => `<option value="${escapeAttr(v)}" ${v === projectNode ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');

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

  const listEl = document.getElementById('targetServerList');
  if (!servers.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">请先添加服务器</div>';
  } else {
    const defaultIds = getProjectDefaultServerIds(currentProject);
    listEl.innerHTML = servers.map(s => {
      const isDefault = defaultIds.includes(s.id);
      if (isDefault) checkedServers.add(s.id);
      return `<div class="server-check-item ${isDefault ? 'checked' : ''}" data-sid="${escapeAttr(s.id)}" onclick="toggleServerCheck('${escapeOnclickArg(s.id)}', this)">
        <span class="srv-check">${isDefault ? '✓' : ''}</span>
        <span>${escapeHtml(s.name)} (${escapeHtml(s.host)})</span>
      </div>`;
    }).join('');
  }

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
    `<option value="${escapeAttr(p)}">${escapeHtml(p)}${i === 0 ? ' (默认)' : ''}</option>`
  ).join('');
}

// ========== Quick Connection Test ==========
async function quickTestServers() {
  if (checkedServers.size === 0) {
    await showAlert('请先选择至少一个服务器', { icon: '⚠️' });
    return;
  }

  const btn = document.getElementById('btnQuickTest');
  // 防连点：上次测试未结束（按钮仍 disabled）直接忽略，避免重复并发测试与 badge 抖动
  if (btn && btn.disabled) return;

  const serverIds = [...checkedServers];

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

  let allOk = true;
  const busyHtml = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span> 测试中...';
  // Promise.allSettled 已吞掉单服务器异常，这里 withButtonBusy 只为防连点 + 进行态；按钮恢复后再叠加结果态
  await withButtonBusy(btn, busyHtml, async () => {
    const results = await Promise.allSettled(
      serverIds.map(async sid => {
        try {
          const result = await API.post(`/api/servers/${sid}/quick-test`, undefined, getConnTimeoutMs() + 5000);
          return { sid, ...result };
        } catch (e) {
          return { sid, success: false, error: e.message };
        }
      })
    );

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
  });

  // withButtonBusy 已复位按钮原文案/可用态；这里叠加 3s 结果态反馈后再复位
  if (btn && btn.isConnected) {
    btn.innerHTML = allOk ? '✅ 全部连通' : '⚠️ 部分失败';
    setTimeout(() => { if (btn.isConnected) btn.innerHTML = '🔗 测试连接'; }, 3000);
  }
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
      html = '<div class="deploy-empty-state deploy-empty-state--grid">暂无常用模块，点击模块右上角 ☆ 添加</div>';
    }
  }

  document.getElementById(`${ctx}ModuleGrid`).innerHTML = html;
  document.getElementById(`${ctx}SelectedCount`).textContent = `已选 ${state.checkedModules.size} 个`;
}

function renderModuleItem(m, isFav, ctx, checked) {
  const isChecked = checked.has(m.name);
  return `
    <div class="module-item ${isChecked ? 'checked' : ''}" onclick="toggleModule('${escapeOnclickArg(m.name)}','${ctx}')">
      <div class="checkbox">${isChecked ? '✓' : ''}</div>
      <span>${escapeHtml(m.name)}</span>
      <button class="btn btn--fav ${isFav ? 'is-active' : ''}" onclick="toggleFavorite('${escapeOnclickArg(m.name)}', event, '${ctx}')" title="${isFav ? '取消常用' : '设为常用'}">${isFav ? '★' : '☆'}</button>
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
async function startBuildOnly(ev) {
  const state = modalState.build;
  if (currentProject.type === 'multi-module' && state.checkedModules.size === 0) {
    await showAlert('请至少选择一个模块', { icon: '⚠️' }); return;
  }
  saveLastSelected(currentProject.name, [...state.checkedModules]);
  
  const selectedNodeVersion = document.getElementById('buildNodeVersion').value;
  if (selectedNodeVersion !== (currentProject.nodeVersion || '')) {
    currentProject.nodeVersion = selectedNodeVersion;
    API.put(`/api/projects/${currentProject.name}`, { nodeVersion: selectedNodeVersion }).catch(() => {});
  }

  const projectName = currentProject.name;
  const modules = [...state.checkedModules];
  // 锁按钮防连点重复发起构建（弹窗关闭前的连点窗口）
  await withButtonBusy(ev && ev.currentTarget, '', async () => {
    // 必须先登记再发请求：卡片忙态与 WS 消息归属都以 deploy-task store 的 active
    // 为判据，不登记会让卡片整个构建期不显示「查看进度」、WS 消息被全部拒收
    window.__deployTask?.begin(projectName);
    closeModal('buildModal');
    showLogModal(true);
    try {
      const data = await API.post('/api/deploy/build', {
        projectName,
        modules,
        nodeVersion: selectedNodeVersion,
      });
      window.__deployTask?.attachTaskId(data.id);
      window.__logViewer?.attachTaskId(data.id);
    } catch (e) {
      appendLog('请求失败: ' + e.message, 'error');
      // 请求未发出，后端不会回 WS 完成事件解锁，必须本地解锁，否则卡片永久卡在 ⏳ 需重启
      window.__deployTask?.abandon(projectName);
      window.__logViewer?.setRunning(false);
    }
  });
}

async function startDeploy(ev) {
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
  if (selectedNodeVersion !== (currentProject.nodeVersion || '')) {
    currentProject.nodeVersion = selectedNodeVersion;
    API.put(`/api/projects/${currentProject.name}`, { nodeVersion: selectedNodeVersion }).catch(() => {});
  }

  const projectName = currentProject.name;
  const modules = [...state.checkedModules];
  const remotePath = document.getElementById('remotePath').value;
  // 锁按钮防连点重复发起部署（多服务器确认后到弹窗关闭前的连点窗口）
  await withButtonBusy(ev && ev.currentTarget, '', async () => {
    // 同 startBuildOnly：先登记 store 再发请求，见那里的说明
    window.__deployTask?.begin(projectName);
    closeModal('deployModal');
    showLogModal(false);
    try {
      const data = await API.post('/api/deploy/start', {
        projectName,
        modules,
        serverIds,
        serverId: serverIds[0],
        remotePath,
        nodeVersion: selectedNodeVersion,
      });
      window.__deployTask?.attachTaskId(data.id);
      window.__logViewer?.attachTaskId(data.id);
    } catch (e) {
      appendLog('请求失败: ' + e.message, 'error');
      // 请求未发出，后端不会回 WS 完成事件解锁，必须本地解锁，否则卡片永久卡在 ⏳ 需重启
      window.__deployTask?.abandon(projectName);
      window.__logViewer?.setRunning(false);
    }
  });
}

// ========== Remote File Browser ==========
let browserCurrentDir = '/';

async function openRemoteBrowser() {
  const serverId = getFirstCheckedServerId();
  if (!serverId) { await showAlert('请先选择至少一个目标服务器', { icon: '⚠️' }); return; }
  
  const server = servers.find(s => s.id === serverId);
  document.getElementById('browserServerInfo').textContent = server ? `${server.name} (${server.host})` : '';

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
    const data = await API.post(`/api/servers/${serverId}/browse`, { path: dirPath }, getConnTimeoutMs() + 5000);
    browserCurrentDir = data.path;
    document.getElementById('browserCurrentPath').textContent = data.path;
    renderBreadcrumb(data.path);
    
    let fallbackHtml = '';
    if (data.fallback) {
      fallbackHtml = `<div class="deploy-fallback">⚠ ${escapeHtml(data.fallback)}</div>`;
    }
    document.getElementById('browserList').innerHTML = fallbackHtml;
    const listEl = document.getElementById('browserList');
    listEl.innerHTML = fallbackHtml + renderBrowserListHtml(data.items, data.path);
  } catch (e) {
    document.getElementById('browserList').innerHTML = 
      `<div style="text-align:center;color:var(--danger);padding:30px">
        <div style="font-size:24px;margin-bottom:8px">⚠</div>
        <div>${escapeHtml(e.message || '目录读取失败')}</div>
        <button class="btn btn--text" onclick="browseRemoteDir('/')" style="margin-top:12px;color:var(--accent)">返回根目录</button>
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
    html += `<span>/</span><button onclick="browseRemoteDir('${escapeOnclickArg(fullPath)}')">${escapeHtml(part)}</button>`;
  }
  document.getElementById('browserBreadcrumb').innerHTML = html;
}

function renderBrowserListHtml(items, currentPath) {
  let html = '';
  
  if (currentPath !== '/') {
    const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    html += `<div class="browser-item parent-dir" onclick="browseRemoteDir('${escapeOnclickArg(parentPath)}')">
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
      html += `<div class="browser-item is-dir" onclick="browseRemoteDir('${escapeOnclickArg(fullPath)}')">
        <span class="item-icon">${icon}</span>
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-size">${size}</span>
        <span class="item-time">${time}</span>
      </div>`;
    } else {
      html += `<div class="browser-item">
        <span class="item-icon">${icon}</span>
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-size">${size}</span>
        <span class="item-time">${time}</span>
      </div>`;
    }
  }
  
  if (items.length === 0) {
    html = '<div class="deploy-empty-state">空目录</div>';
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
  let found = false;
  for (const opt of select.options) {
    if (opt.value === finalPath) { opt.selected = true; found = true; break; }
  }
  if (!found) {
    const newOpt = new Option(`${finalPath} (浏览选择)`, finalPath, false, true);
    select.appendChild(newOpt);
  }
  closeModal('remoteBrowserModal');
}

// ========== Server Management ==========
/*
  服务器管理子页整体由 Vue 接管，见 `views/deploy/DeployServersView.vue`。
  这里只保留取数：`servers` 仍是构建/部署弹窗与项目默认配置弹窗的数据源，
  等第 6 步弹窗迁完可以一并删除。失败态与列表渲染归 Vue 侧。
*/
async function loadServers() {
  try {
    servers = await API.get('/api/servers');
  } catch (e) {
    console.error('加载服务器失败:', e);
  }
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

function showLogModal(buildOnly) {
  const modules = currentProject.type === 'multi-module' ? [...modalState[activeCtx].checkedModules] : ['整体构建'];
  openLogViewer({
    kind: 'deploy',
    title: buildOnly ? '构建进度' : '部署进度',
    subtitle: `${currentProject.name} · ${modules.join(', ')}`,
    projectName: currentProject.name,
    steps: buildOnly ? ['拉取代码', '构建中'] : ['预检', '拉取代码', '构建中', '上传中', '完成'],
  });
  // openLogViewer 默认 running: true，无需再单独同步「关闭/最小化」文案
  logViewer()?.setProgress({ percent: 0, indeterminate: false, label: '0%' });
}
