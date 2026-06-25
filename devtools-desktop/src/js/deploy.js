// ========== Module: Deploy (部署面板) ==========

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
    await loadRunStatuses();
    renderProjects();
    renderRunPage();
    refreshHomeIfVisible();
    syncTrayMenu();
  } catch (e) {
    console.error('加载项目失败:', e);
    // 首屏失败（尚无数据）：清屏给失败态 + 重试入口；后台刷新失败：保留旧数据，仅 toast
    if (!projects || projects.length === 0) {
      const fail = (id) => {
        const el = document.getElementById(id);
        if (el) renderState(el, { kind: 'error', icon: '⚠️', title: '加载项目失败', desc: e.message, actionHTML: '<button class="btn" onclick="loadProjects()">重试</button>', block: true });
      };
      fail('runProjectGrid');
      fail('projectGrid');
      const runOverview = document.getElementById('runOverview');
      if (runOverview) runOverview.innerHTML = '';
    } else {
      showToast('刷新项目失败：' + e.message);
    }
  }
}

function renderProjects() {
  const searchEl = document.getElementById('searchInput');
  const search = searchEl ? searchEl.value.toLowerCase() : '';
  let filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search) || (p.displayName && p.displayName.toLowerCase().includes(search)));

  if (currentFilter === 'multi') filtered = filtered.filter(p => p.type === 'multi-module');
  else if (currentFilter === 'single') filtered = filtered.filter(p => p.type === 'single');
  else if (currentFilter === 'configured') filtered = filtered.filter(p => getProjectDefaultServerIds(p).length > 0);
  else if (currentFilter === 'unconfigured') filtered = filtered.filter(p => getProjectDefaultServerIds(p).length === 0);

  const grid = document.getElementById('projectGrid');
  if (!grid) return;
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
      const mods = (last.modules || []).map(escapeHtml).join(', ');
      const typeLabel = last.type === 'deploy' ? '部署' : '构建';
      const info = last.type === 'deploy' ? `${typeLabel} → ${escapeHtml(last.serverName)} · ${mods}` : `${typeLabel} · ${mods}`;
      lastDeployHtml = `<div class="card-last-deploy ${last.status}">${icon} ${ago} · ${info} · ${escapeHtml(last.duration)}</div>`;
    }
    const pnEsc = escapeOnclickArg(p.name);
    return `
    <div class="project-card ${isBusy ? 'card-busy' : ''}" data-project="${escapeAttr(p.name)}" onclick="openDeployModal('${pnEsc}')">
      <div class="card-top">
        <div class="card-name">${isMulti ? '📦' : '📄'} ${escapeHtml(p.displayName || p.name)}</div>
        <span class="card-badge ${isMulti ? 'badge-multi' : 'badge-single'}">${isMulti ? '多模块' : '单体'}</span>
      </div>
      <div class="card-meta">
        <span><span class="badge-tool">${escapeHtml(p.tool)}</span> ${nodeLabel} ${isMulti ? moduleCount + ' 个模块' : ''}</span>
        <span>构建: ${escapeHtml(p.buildCommand || 'npm run build')}</span>
      </div>
      ${isMulti ? `<div class="card-modules">${(p.modules || []).slice(0, 5).map(m => `<span class="module-tag">${escapeHtml(m.name)}</span>`).join('')}${moduleCount > 5 ? `<span class="module-more">+${moduleCount - 5}</span>` : ''}</div>` : ''}
      <div class="card-status ${getProjectDefaultServerIds(p).length > 0 ? 'status-configured' : 'status-unconfigured'}">
        ${getProjectDefaultServerIds(p).length > 0 ? `● 已配置 ${getProjectDefaultServerIds(p).length} 台服务器` : '○ 未配置服务器'}
      </div>
      ${lastDeployHtml}
      <div class="card-actions">
        ${isBusy ? `
        <button class="btn btn--warning" style="flex:1" onclick="event.stopPropagation();reopenLogModal()">⏳ 查看进度...</button>
        ` : `
        <button class="btn" onclick="event.stopPropagation();openBuildModal('${pnEsc}')" ${disabledAttr}>🔨 构建</button>
        <button class="btn btn--primary" onclick="event.stopPropagation();openDeployModal('${pnEsc}')" ${disabledAttr}>🚀 部署</button>
        <button class="btn btn--icon" onclick="event.stopPropagation();openProjectConfig('${pnEsc}')" title="默认配置">⚙</button>
        <button class="btn btn--icon btn--danger" onclick="event.stopPropagation();removeProject('${pnEsc}')" title="移除项目">🗑</button>
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
    if (last && el) {
      const icon = last.status === 'success' ? '✅' : '❌';
      const ago = timeAgo(last.timestamp);
      const mods = (last.modules || []).join(', ');
      const typeLabel = last.type === 'deploy' ? '部署' : '构建';
      const info = last.type === 'deploy' ? `${typeLabel} → ${last.serverName} · ${mods}` : `${typeLabel} · ${mods}`;
      el.className = `card-last-deploy ${last.status}`;
      el.textContent = `${icon} ${ago} · ${info} · ${last.duration}`;
    }
  });
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

  const nodeSelect = document.getElementById('configNodeVersion');
  nodeSelect.innerHTML = `<option value="">系统默认 (${escapeHtml(currentNodeVersion)})</option>`
    + nodeVersions.map(v => `<option value="${escapeAttr(v)}" ${v === (project.nodeVersion || '') ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');

  const defaultIds = getProjectDefaultServerIds(project);
  const listEl = document.getElementById('configServerList');
  if (!servers.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">暂无服务器</div>';
  } else {
    listEl.innerHTML = servers.map(s => {
      const checked = defaultIds.includes(s.id);
      if (checked) configCheckedServers.add(s.id);
      return `<div class="server-check-item ${checked ? 'checked' : ''}" data-sid="${escapeAttr(s.id)}" onclick="toggleConfigServer('${escapeOnclickArg(s.id)}', this)">
        <span class="srv-check">${checked ? '✓' : ''}</span>
        <span>${escapeHtml(s.name)} (${escapeHtml(s.host)})</span>
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

async function saveProjectConfig(ev) {
  const nodeVersion = document.getElementById('configNodeVersion').value;
  const displayName = document.getElementById('configDisplayName').value.trim();
  const defaultServerIds = [...configCheckedServers];
  const defaultServerId = defaultServerIds[0] || '';
  const name = configProjectName;
  await withButtonBusy(ev && ev.currentTarget, '保存中…', async () => {
    try {
      await API.put(`/api/projects/${name}`, { nodeVersion, defaultServerId, defaultServerIds, displayName });
      const p = projects.find(p => p.name === name);
      if (p) {
        p.nodeVersion = nodeVersion;
        p.defaultServerId = defaultServerId;
        p.defaultServerIds = defaultServerIds;
        p.displayName = displayName;
      }
      closeModal('projectConfigModal');
      renderProjects();
      showToast('✅ 配置已保存', `${name} 的默认配置已更新`);
    } catch (e) {
      showAlert('保存失败: ' + e.message, { icon: '❌' });
    }
  });
}

// ========== Add Project Modal ==========
let currentAddMode = 'scan';
let checkedBrowseProjects = new Set();

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
  document.getElementById('addPanelScan').style.display = '';
  document.getElementById('addPanelBrowse').style.display = 'none';
  const btns = document.querySelectorAll('#addProjectModal .seg-btn');
  btns.forEach((b, i) => { b.classList.toggle('active', i === 0); });
  document.getElementById('addProjectModal').classList.add('active');
}

function switchAddMode(mode, btn) {
  currentAddMode = mode;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('addPanelScan').style.display = mode === 'scan' ? '' : 'none';
  document.getElementById('addPanelBrowse').style.display = mode === 'browse' ? '' : 'none';
  if (mode === 'browse') browseTo();
  updateAddSubmitBtn();
}

function renderAvailableProjects(filter = '') {
  const filtered = availableProjects.filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  // 三种空态区分：扫描目录下无项目 / 搜索无匹配 / 全部已添加，避免共用一句误导文案
  let emptyMsg;
  if (!availableProjects.length) emptyMsg = '未在扫描目录下发现前端项目，可切到「手动浏览」选择';
  else if (filter) emptyMsg = '没有匹配的项目';
  else emptyMsg = '所有项目已添加';
  document.getElementById('availableProjectGrid').innerHTML = filtered.length
    ? filtered.map(p => `
      <div class="module-item ${checkedAvailableProjects.has(p.path) ? 'checked' : ''}" data-path="${escapeAttr(p.path)}" onclick="toggleAvailableProject(this)">
        <div class="checkbox">${checkedAvailableProjects.has(p.path) ? '✓' : ''}</div>
        <span title="${escapeAttr(p.name)}">${escapeHtml(p.name)}</span>
      </div>`).join('')
    : `<div style="text-align:center;color:var(--text-muted);padding:24px;grid-column:1/-1">${emptyMsg}</div>`;
  document.getElementById('selectedProjectCount').textContent = `已选 ${checkedAvailableProjects.size} 个`;
  updateAddSubmitBtn();
}

// 路径经 data-path 传递（浏览器解码后即原始值），避免内联 onclick 字符串拼接的转义陷阱
function toggleAvailableProject(el) {
  const path = el.dataset.path;
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
  let html = `<button onclick="browseTo('${escapeOnclickArg(root)}')">📁 project</button>`;
  let accum = root;
  parts.forEach(p => {
    accum = accum + '/' + p;
    html += `<span>/</span><button onclick="browseTo('${escapeOnclickArg(accum)}')">${escapeHtml(p)}</button>`;
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
      const checked = checkedBrowseProjects.has(e.path);
      const disabled = e.alreadyAdded;
      return `<div class="browser-item ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
                   ${disabled ? '' : `data-path="${escapeAttr(e.path)}" onclick="toggleBrowseProject(this)"`}
                   style="cursor:${disabled ? 'not-allowed' : 'pointer'}">
        <span style="display:flex;align-items:center;gap:8px;min-width:0">
          ${disabled ? '✅' : checked ? '<span style="color:var(--accent)">☑</span>' : '☐'}
          <span style="color:var(--accent)">📦</span> <span title="${escapeAttr(e.name)}">${escapeHtml(e.name)}</span>
        </span>
        <span style="font-size:11px;color:var(--text-muted)">${disabled ? '已添加' : '前端项目'}</span>
      </div>`;
    } else if (e.hasSubDirs) {
      return `<div class="browser-item" onclick="browseTo('${escapeOnclickArg(e.path)}')" style="cursor:pointer">
        <span style="display:flex;align-items:center;gap:8px">📁 <span title="${escapeAttr(e.name)}">${escapeHtml(e.name)}</span></span>
        <span style="font-size:11px;color:var(--text-muted)">→</span>
      </div>`;
    } else {
      return `<div class="browser-item disabled" style="cursor:default;opacity:.4">
        <span style="display:flex;align-items:center;gap:8px">📁 ${escapeHtml(e.name)}</span>
        <span style="font-size:11px;color:var(--text-muted)">空</span>
      </div>`;
    }
  }).join('');
}

// 路径经 data-path 传递；重刷高亮也读 dataset.path，不再正则反解 onclick（含单引号路径也能正确命中）
function toggleBrowseProject(el) {
  const p = el.dataset.path;
  checkedBrowseProjects.has(p) ? checkedBrowseProjects.delete(p) : checkedBrowseProjects.add(p);
  document.getElementById('browseSelectedCount').textContent = `已选 ${checkedBrowseProjects.size} 个`;
  document.querySelectorAll('#addBrowseList .browser-item:not(.disabled)').forEach(item => {
    if (item.dataset.path) item.classList.toggle('selected', checkedBrowseProjects.has(item.dataset.path));
  });
  updateAddSubmitBtn();
}

function updateAddSubmitBtn() {
  const total = currentAddMode === 'scan' ? checkedAvailableProjects.size : checkedBrowseProjects.size;
  document.getElementById('addProjectSubmitBtn').textContent = total > 0 ? `添加 ${total} 个项目` : '添加选中项目';
}

async function addSelectedProjects(ev) {
  const paths = currentAddMode === 'scan' ? [...checkedAvailableProjects] : [...checkedBrowseProjects];
  if (paths.length === 0) { await showAlert('请至少选择一个项目', { icon: '⚠️' }); return; }
  await withButtonBusy(ev && ev.currentTarget, '添加中…', async () => {
    try {
      const result = await API.post('/api/projects/batch', { paths });
      closeModal('addProjectModal');
      await loadProjects();
      // 分列：已存在跳过 vs 真失败，便于用户定位（后端对重复返回 error:'已存在'）
      const errors = result.errors || [];
      const skipped = errors.filter(e => e.error === '已存在');
      const failed = errors.filter(e => e.error !== '已存在');
      const parts = [`成功添加 ${result.added.length} 个`];
      if (skipped.length) parts.push(`${skipped.length} 个已存在跳过`);
      if (failed.length) parts.push(`${failed.length} 个失败`);
      showAlert(parts.join('，'), { icon: failed.length ? '⚠️' : '✅' });
    } catch (e) {
      showAlert('添加失败: ' + e.message, { icon: '❌' });
    }
  });
}

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
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span> 测试中...';

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
  setTimeout(() => { btn.innerHTML = '🔗 测试连接'; }, 3000);
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
    <div class="module-item ${isChecked ? 'checked' : ''}" onclick="toggleModule('${escapeOnclickArg(m.name)}','${ctx}')">
      <div class="checkbox">${isChecked ? '✓' : ''}</div>
      <span>${escapeHtml(m.name)}</span>
      <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${escapeOnclickArg(m.name)}', event, '${ctx}')" title="${isFav ? '取消常用' : '设为常用'}">${isFav ? '★' : '☆'}</button>
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
    setBusy(projectName);
    activeTask = { id: null, projectName, isRunning: true };
    closeModal('buildModal');
    showLogModal(true);
    try {
      const data = await API.post('/api/deploy/build', {
        projectName,
        modules,
        nodeVersion: selectedNodeVersion,
      });
      currentDeployId = data.id;
      if (activeTask) activeTask.id = data.id;
      updateLogModalCloseBtn();
    } catch (e) {
      appendLog('请求失败: ' + e.message, 'error');
      // 请求未发出，后端不会回 WS 完成事件解锁，必须本地解锁，否则卡片永久卡在 ⏳ 需重启
      clearBusy(projectName);
      renderProjects();
      activeTask = null;
      updateLogModalCloseBtn();
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
    setBusy(projectName);
    activeTask = { id: null, projectName, isRunning: true };
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
      currentDeployId = data.id;
      if (activeTask) activeTask.id = data.id;
      updateLogModalCloseBtn();
    } catch (e) {
      appendLog('请求失败: ' + e.message, 'error');
      // 请求未发出，后端不会回 WS 完成事件解锁，必须本地解锁，否则卡片永久卡在 ⏳ 需重启
      clearBusy(projectName);
      renderProjects();
      activeTask = null;
      updateLogModalCloseBtn();
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
    const data = await API.post(`/api/servers/${serverId}/browse`, { path: dirPath });
    browserCurrentDir = data.path;
    document.getElementById('browserCurrentPath').textContent = data.path;
    renderBreadcrumb(data.path);
    
    let fallbackHtml = '';
    if (data.fallback) {
      fallbackHtml = `<div style="padding:8px 14px;background:rgba(255,193,7,.1);border:1px solid rgba(255,193,7,.3);border-radius:6px;margin-bottom:8px;font-size:12px;color:#ffc107">⚠ ${escapeHtml(data.fallback)}</div>`;
    }
    document.getElementById('browserList').innerHTML = fallbackHtml;
    const listEl = document.getElementById('browserList');
    listEl.innerHTML = fallbackHtml + renderBrowserListHtml(data.items, data.path);
  } catch (e) {
    document.getElementById('browserList').innerHTML = 
      `<div style="text-align:center;color:var(--danger);padding:30px">
        <div style="font-size:24px;margin-bottom:8px">⚠</div>
        <div>${escapeHtml(e.message || '目录读取失败')}</div>
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
let sfDeployPaths = [];

async function loadServers() {
  try {
    servers = await API.get('/api/servers');
    renderServers();
  } catch (e) {
    console.error('加载服务器失败:', e);
    // 首次加载失败给失败态+重试入口（与 loadProjects 一致）；已有数据时仅 toast，保留旧列表
    if (!servers || servers.length === 0) {
      const el = document.getElementById('serverList');
      const hd = document.getElementById('serverHeader');
      if (hd) hd.innerHTML = '';
      if (el) renderState(el, { kind: 'error', icon: '⚠️', title: '加载服务器失败', desc: e.message, actionHTML: '<button class="btn" onclick="loadServers()">重试</button>', block: true });
    } else {
      showToast('刷新服务器失败：' + e.message);
    }
  }
}

function renderServers() {
  const list = document.getElementById('serverList');
  const headerEl = document.getElementById('serverHeader');
  if (servers.length === 0) {
    if (headerEl) headerEl.innerHTML = '';
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无服务器，点击"添加服务器"按钮</div>';
    return;
  }
  // 表头行渲到固定容器 #serverHeader（不随数据滚动），数据行渲到独立滚动的 #serverList，
  // 二者共用同一套 .server-row grid 列宽以保证对齐
  if (headerEl) headerEl.innerHTML = `
    <div class="server-row server-head">
      <div>名称</div><div>Host</div><div>用户</div><div>端口</div><div>目标路径</div><div>操作</div>
    </div>`;
  list.innerHTML = `${servers.map(s => `
    <div class="server-row server-card">
      <div class="server-name">📦 ${escapeHtml(s.name)}</div>
      <div class="server-host">${escapeHtml(s.host)}</div>
      <div>${escapeHtml(s.username)}</div>
      <div>${s.port}</div>
      <div class="server-host">${escapeHtml(s.defaultRemotePath || '/')}</div>
      <div class="server-actions">
        <button class="btn btn--icon btn--sm" title="编辑" onclick="editServer('${escapeOnclickArg(s.id)}')">✎</button>
        <button class="btn btn--icon btn--sm" title="测试连接" onclick="testServer('${escapeOnclickArg(s.id)}', this)">⚡</button>
        <button class="btn btn--icon btn--sm btn--danger" title="删除" onclick="deleteServer('${escapeOnclickArg(s.id)}')">🗑</button>
      </div>
    </div>`).join('')}`;
}

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
      <span class="tag-text" title="双击编辑" ondblclick="editPathTag(${i}, this)">${escapeHtml(p)}</span>
      <button class="tag-remove" onclick="removePathTag(${i})" title="删除">✕</button>
    </span>
  `).join('');
}

function editPathTag(index, textEl) {
  const tag = textEl.closest('.path-tag');
  const currentValue = sfDeployPaths[index];
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'tag-edit-input';
  
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
  
  if (e.key === 'Backspace' && !input.value && sfDeployPaths.length > 0) {
    sfDeployPaths.pop();
    renderPathTags();
  }
});

function editServer(id) {
  const server = servers.find(s => s.id === id);
  if (server) showServerForm(server);
}

async function saveServer(ev) {
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

  const isMasked = /^\*+$/.test(passwordValue);
  if (!isMasked && passwordValue) {
    data.password = passwordValue;
  }

  if (!data.name || !data.host) { await showAlert('名称和 Host 必填', { icon: '⚠️' }); return; }
  await withButtonBusy(ev && ev.currentTarget, '保存中…', async () => {
    try {
      if (id) await API.put(`/api/servers/${id}`, data);
      else await API.post('/api/servers', data);
      closeModal('serverFormModal');
      await loadServers();
    } catch (e) {
      showAlert('保存失败: ' + e.message, { icon: '❌' });
    }
  });
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
  const server = servers.find(s => s.id === id);
  const serverName = server ? server.name : id;
  const serverHost = server ? `${server.username}@${server.host}:${server.port}` : '';

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
let historyData = [];
let batchSelectMode = false;
let selectedHistoryIds = new Set();
let chipFilters = { segType: 'all', segStatus: 'all' };

async function loadHistory() {
  try {
    historyData = await API.get('/api/history');
    renderHistory();
  } catch (e) {
    console.error('加载历史失败:', e);
    // 首次加载失败给失败态+重试入口；已有数据时仅 toast，保留旧表格
    if (!historyData || historyData.length === 0) {
      const el = document.getElementById('historyTable');
      const hd = document.getElementById('historyHeader');
      if (hd) hd.innerHTML = '';
      if (el) renderState(el, { kind: 'error', icon: '⚠️', title: '加载历史失败', desc: e.message, actionHTML: '<button class="btn" onclick="loadHistory()">重试</button>', block: true });
    } else {
      showToast('刷新历史失败：' + e.message);
    }
  }
}

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

  const statsEl = document.getElementById('historyStats');
  if (statsEl) {
    const total = historyData.length;
    const successCount = historyData.filter(h => h.status === 'success').length;
    const failCount = total - successCount;
    const filterNote = filtered.length !== total ? ` · 当前筛选 ${filtered.length} 条` : '';
    statsEl.textContent = `共 ${total} 条记录 · ✅ ${successCount} 成功 · ❌ ${failCount} 失败${filterNote}`;
  }

  const table = document.getElementById('historyTable');
  const headerEl = document.getElementById('historyHeader');
  if (filtered.length === 0) {
    if (headerEl) headerEl.innerHTML = '';
    table.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:60px">暂无匹配的部署记录</div>';
    return;
  }

  const checkHeader = batchSelectMode ? '<div class="h-cell h-check"></div>' : '';

  // 表头行渲到固定容器 #historyHeader（不随数据滚动），数据行渲到独立滚动的 #historyTable，
  // 二者共用同一套 .history-row grid 列宽以保证对齐
  if (headerEl) headerEl.innerHTML = `
    <div class="history-row history-header${batchSelectMode ? ' with-check' : ''}">
      ${checkHeader}
      <div class="h-cell h-time">时间</div>
      <div class="h-cell h-project">项目</div>
      <div class="h-cell h-type">类型</div>
      <div class="h-cell h-modules">模块</div>
      <div class="h-cell h-server">服务器</div>
      <div class="h-cell h-status">状态</div>
      <div class="h-cell h-actions">操作</div>
    </div>`;

  table.innerHTML = `${filtered.map(h => {
      const time = new Date(h.timestamp).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      const typeLabel = h.type === 'deploy' ? '部署' : '构建';
      const typeDot = h.type === 'deploy' ? 'deploy' : 'build';
      const statusText = h.status === 'success' ? h.duration : '失败';
      const isSelected = selectedHistoryIds.has(h.id);
      const checkCell = batchSelectMode
        ? `<div class="h-cell h-check"><input type="checkbox" class="ios-check" ${isSelected ? 'checked' : ''} onchange="toggleHistorySelect('${escapeOnclickArg(h.id)}', this.checked)"></div>`
        : '';
      return `<div class="history-row ${isSelected ? 'row-selected' : ''}${batchSelectMode ? ' with-check' : ''}">
        ${checkCell}
        <div class="h-cell h-time">${time}</div>
        <div class="h-cell h-project">${escapeHtml(h.projectName)}</div>
        <div class="h-cell h-type"><span class="type-pill ${typeDot}">${typeLabel}</span></div>
        <div class="h-cell h-modules"><span class="history-modules">${(h.modules || []).map(m => `<span class="module-tag">${escapeHtml(m)}</span>`).join('')}</span></div>
        <div class="h-cell h-server">${escapeHtml(h.serverName || '—')}</div>
        <div class="h-cell h-status ${h.status === 'success' ? 'status-success' : 'status-fail'}"><span class="status-dot-mini"></span>${statusText}</div>
        <div class="h-cell h-actions">
          <button class="btn btn--icon btn--sm" onclick="viewLog('${escapeOnclickArg(h.id)}')" title="查看日志">⌗</button>
          <button class="btn btn--icon btn--sm btn--danger" onclick="event.stopPropagation();deleteSingleHistory('${escapeOnclickArg(h.id)}')" title="删除">⌫</button>
        </div>
      </div>`;
    }).join('')}`;
}

function toggleBatchSelect() {
  batchSelectMode = !batchSelectMode;
  selectedHistoryIds.clear();
  const btn = document.getElementById('btnToggleSelect');
  const delBtn = document.getElementById('btnBatchDelete');
  if (batchSelectMode) {
    btn.textContent = '✕ 取消';
    btn.className = 'btn btn--primary';
    delBtn.style.display = 'inline-flex';
  } else {
    btn.textContent = '☑ 选择';
    btn.className = 'btn';
    delBtn.style.display = 'none';
  }
  updateBatchCount();
  renderHistory();
}

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

function showCleanupDialog() {
  document.getElementById('cleanupModal').classList.add('active');
}

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
      ? `部署完成！耗时 <strong>${escapeHtml(record.duration)}</strong>` : '部署失败';
    (record.logs || []).forEach(l => appendLog(l.text, l.type));
    document.getElementById('logModal').classList.add('active');
  } catch (e) {
    showAlert('加载日志失败: ' + e.message, { icon: '❌' });
  }
}

// ========== FileZilla Import ==========
let fzServers = [];
let checkedFzServers = new Set();
let currentFzXmlContent = '';

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
      ? (checked ? '<span style="font-size:10px;color:var(--success);margin-left:4px">已导入</span>' : '<span style="font-size:10px;color:var(--danger);margin-left:4px">将删除</span>')
      : (checked ? '<span style="font-size:10px;color:var(--primary);margin-left:4px">待导入</span>' : '');
    return `
    <div class="module-item ${checked ? 'checked' : ''} ${!checked && s.exists ? 'will-remove' : ''}"
         onclick="toggleFzServer('${escapeOnclickArg(s.name)}')"
         title="${escapeAttr(s.username)}@${escapeAttr(s.host)}:${escapeAttr(s.port)}">
      <div class="checkbox">${checked ? '✓' : ''}</div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <span>${escapeHtml(s.name)}${statusTag}</span>
        <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(s.host)}:${escapeHtml(s.port)}</span>
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
  const toAdd = fzServers.filter(s => !s.exists && checkedFzServers.has(s.name)).map(s => s.name);
  const toRemove = fzServers.filter(s => s.exists && !checkedFzServers.has(s.name));

  if (toAdd.length === 0 && toRemove.length === 0) { await showAlert('没有变更', { icon: 'ℹ️' }); return; }

  if (toRemove.length > 0) {
    const names = toRemove.map(s => s.name).join('、');
    if (!await showConfirm(`将删除 ${toRemove.length} 个服务器：${names}\n确定继续？`, { icon: '🗑️', danger: true, confirmText: '继续删除' })) return;
  }

  try {
    const msgs = [];

    if (toRemove.length > 0) {
      for (const s of toRemove) {
        const existing = servers.find(e => e.host === s.host && String(e.port) === String(s.port));
        if (existing) await API.del(`/api/servers/${existing.id}`);
      }
      msgs.push(`删除 ${toRemove.length} 个`);
    }

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
  document.getElementById('logTitle').textContent = buildOnly ? '构建进度' : '部署进度';
  const modules = currentProject.type === 'multi-module' ? [...modalState[activeCtx].checkedModules] : ['整体构建'];
  document.getElementById('logSubtitle').textContent = `${currentProject.name} · ${modules.join(', ')}`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressBar').parentElement?.classList.remove('is-indeterminate');
  document.getElementById('progressText').textContent = '0%';

  const steps = buildOnly ? ['拉取代码', '构建中'] : ['预检', '拉取代码', '构建中', '上传中', '完成'];
  document.getElementById('progressSteps').innerHTML = steps.map((s, i) =>
    `<div class="step${i === 0 ? ' active' : ''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');

  document.getElementById('logModal').classList.add('active');
  updateLogModalCloseBtn();
}
