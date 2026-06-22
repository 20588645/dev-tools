// ========== Module: Run (本地运行) ==========

function getRunHomeModuleName() {
  return (document.getElementById('runHomeModuleName')?.value || '').trim() || 'home';
}

function normalizeModuleList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getRunFavoriteModules(project) {
  const favorites = normalizeModuleList(project.favoriteRunModules);
  const modules = normalizeModuleList((project.modules || []).map(m => m.name));
  const validFavorites = favorites.filter(name => modules.some(m => m.toLowerCase() === name.toLowerCase()));
  const homeModuleName = (project.runHomeModule || 'home').trim() || 'home';

  if (project.runIncludeHome !== false && !validFavorites.some(name => name.toLowerCase() === homeModuleName.toLowerCase())) {
    validFavorites.push(homeModuleName);
  }

  return validFavorites;
}

function setRunModuleSearchVisible(visible) {
  const search = document.getElementById('runModuleSearch');
  if (!search) return;
  search.style.display = visible ? '' : 'none';
  if (!visible) search.value = '';
}

function renderRunModulePicker(project, mode = runModalMode) {
  const moduleRow = document.getElementById('runModuleRow');
  const homeRow = document.getElementById('runHomeRow');
  const modulePicker = document.getElementById('runModuleSelect');
  const includeHome = document.getElementById('runIncludeHome');
  const homeInput = document.getElementById('runHomeModuleName');
  const homeModuleName = project.runHomeModule || 'home';
  const favoriteModules = normalizeModuleList(project.favoriteRunModules);
  const modules = (project.modules || []).filter(m => m.name && m.name.toLowerCase() !== homeModuleName.toLowerCase());

  if (project.type !== 'multi-module') {
    moduleRow.style.display = 'none';
    homeRow.style.display = 'none';
    setRunModuleSearchVisible(false);
    modulePicker.innerHTML = '';
    includeHome.checked = false;
    homeInput.value = 'home';
    return;
  }

  if (mode === 'start') {
    moduleRow.style.display = 'none';
    homeRow.style.display = 'none';
    setRunModuleSearchVisible(false);
    modulePicker.innerHTML = '';
    includeHome.checked = project.runIncludeHome !== false;
    homeInput.value = homeModuleName;
    return;
  }

  homeRow.style.display = '';
  setRunModuleSearchVisible(true);
  includeHome.checked = project.runIncludeHome !== false;
  homeInput.value = homeModuleName;

  // 即使无子模块也保留该行：给出空态提示，避免「无模块可收藏，启动又必须选模块」的死结
  moduleRow.style.display = '';
  modulePicker.innerHTML = modules.length
    ? modules.map(m => {
      const value = escapeAttr(m.name);
      const label = escapeHtml(m.name);
      return `
        <label class="run-module-option" data-module-name="${value}" title="${value}">
          <input type="checkbox" value="${value}" ${favoriteModules.some(name => name.toLowerCase() === m.name.toLowerCase()) ? 'checked' : ''}>
          <span>${label}</span>
        </label>`;
    }).join('')
    : '<div class="run-module-empty" style="color:var(--text-muted);font-size:11px;padding:10px 4px">未检测到可运行的子模块，请检查项目结构，或以单体方式直接运行。</div>';
  filterRunConfigModules();
}

function getCheckedRunFavoriteModules() {
  return [...document.querySelectorAll('#runModuleSelect input[type="checkbox"]:checked')]
    .map(input => input.value)
    .filter(Boolean);
}

function filterRunConfigModules() {
  const search = (document.getElementById('runModuleSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#runModuleSelect .run-module-option').forEach(option => {
    const name = (option.dataset.moduleName || option.textContent || '').toLowerCase();
    option.style.display = !search || name.includes(search) ? '' : 'none';
  });
}

function toggleRunQuickModule(moduleName) {
  if (!moduleName) return;
  if (selectedRunModuleNames.has(moduleName)) {
    selectedRunModuleNames.delete(moduleName);
  } else {
    selectedRunModuleNames.add(moduleName);
  }
  document.querySelectorAll('.run-quick-module').forEach(btn => {
    const checked = selectedRunModuleNames.has(btn.dataset.module);
    btn.classList.toggle('active', checked);
    const mark = btn.querySelector('.run-quick-check');
    if (mark) mark.textContent = checked ? '✓' : '';
  });
  updateRunStartBtnState();
}

// 启动模式 + 多模块项目未勾选任何模块时禁用「启动运行」，事前引导而非点了才报错
function updateRunStartBtnState() {
  const btn = document.getElementById('runStartBtn');
  if (!btn) return;
  if (runModalMode !== 'start') { btn.disabled = false; btn.removeAttribute('title'); return; }
  const project = projects.find(p => p.name === runModalProjectName);
  if (project && project.type === 'multi-module' && selectedRunModuleNames.size === 0) {
    btn.disabled = true;
    btn.title = '请先勾选要运行的模块';
  } else {
    btn.disabled = false;
    btn.removeAttribute('title');
  }
}

function inferRunCommand(project) {
  if (project.runCommand) return project.runCommand;
  if (project.tool === 'Vue CLI') return 'npm run serve';
  return 'npm run dev';
}

function renderRunPage() {
  const grid = document.getElementById('runProjectGrid');
  const overview = document.getElementById('runOverview');
  if (!grid || !overview) return;

  const search = (document.getElementById('runSearchInput')?.value || '').toLowerCase();
  let list = projects.filter(p => !search
    || p.name.toLowerCase().includes(search)
    || (p.displayName && p.displayName.toLowerCase().includes(search))
    || (p.path && p.path.toLowerCase().includes(search)));

  if (currentRunFilter === 'running') list = list.filter(p => runningProjects[p.name]);
  else if (currentRunFilter === 'multi') list = list.filter(p => p.type === 'multi-module');
  else if (currentRunFilter === 'single') list = list.filter(p => p.type === 'single');

  // 运行中的项目置顶
  list.sort((a, b) => {
    const aRunning = runningProjects[a.name] ? 1 : 0;
    const bRunning = runningProjects[b.name] ? 1 : 0;
    return bRunning - aRunning;
  });

  const runningCount = Object.values(runningProjects).filter(job => ['starting', 'running'].includes(job.status)).length;
  // 原「已保存命令」恒等于项目总数（扫描时每个项目都会写入默认命令），无信息量；
  // 改统计多模块项目数，与单体区分，是真实可读的口径
  const multiModuleCount = projects.filter(p => p.type === 'multi-module').length;
  overview.innerHTML = `
    <div class="run-stat-card"><span>可运行项目</span><strong>${projects.length}</strong></div>
    <div class="run-stat-card"><span>运行中</span><strong>${runningCount}</strong></div>
    <div class="run-stat-card"><span>多模块项目</span><strong>${multiModuleCount}</strong></div>
  `;

  // 显示/隐藏批量停止按钮
  const batchStopBtn = document.getElementById('btnBatchStopRun');
  if (batchStopBtn) batchStopBtn.style.display = runningCount > 0 ? '' : 'none';

  if (list.length === 0) {
    grid.classList.remove('is-grouped');
    // 区分两种空态：从未添加项目 → 引导添加；有项目但被搜索/筛选过滤光 → 提示无匹配
    if (projects.length === 0) {
      renderState(grid, { kind: 'empty', icon: '📂', title: '还没有可运行的项目', desc: '点击右上角「+ 添加项目」开始', actionHTML: '<button class="btn btn--primary" onclick="showAddProject()">+ 添加项目</button>', block: true });
    } else {
      renderState(grid, { kind: 'empty', title: '没有匹配的项目', block: true });
    }
    return;
  }

  // 无任何分组 → 维持平铺；否则按 groupName 渲染可折叠分区
  const hasGroups = projects.some(p => (p.groupName || '').trim());
  if (!hasGroups) {
    grid.classList.remove('is-grouped');
    grid.innerHTML = list.map(runProjectCardHTML).join('');
    return;
  }

  // 按 groupName 聚合（list 已按运行中置顶，组内沿用此序）
  const groups = new Map();
  for (const p of list) {
    const key = (p.groupName || '').trim() || RUN_UNGROUPED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  // 具名分组按用户自定义顺序（localStorage runGroupOrder）排列，新组按名称补在后；仅渲染当前可见的组
  const allNamed = orderedRunGroups([...new Set(projects.map(p => (p.groupName || '').trim()).filter(Boolean))]);
  const namedKeys = allNamed.filter(k => groups.has(k));
  if (namedKeys.length === 0) {
    // 当前可见项里没有任何具名分组 → 退回平铺，避免只剩一个「未分组」头
    grid.classList.remove('is-grouped');
    grid.innerHTML = list.map(runProjectCardHTML).join('');
    return;
  }
  const orderedKeys = groups.has(RUN_UNGROUPED) ? [...namedKeys, RUN_UNGROUPED] : namedKeys;

  grid.classList.add('is-grouped');
  grid.innerHTML = orderedKeys.map(key => {
    const items = groups.get(key);
    const isUngrouped = key === RUN_UNGROUPED;
    const collapsed = isRunGroupCollapsed(key);
    const runningN = items.filter(p => runningProjects[p.name]).length;
    const gi = isUngrouped ? -1 : allNamed.indexOf(key);
    const moveHtml = isUngrouped ? ''
      : `<button class="btn btn--icon btn--sm run-group-move" title="上移" ${gi <= 0 ? 'disabled' : ''} onclick="moveRunGroup('${escapeOnclickArg(key)}', -1, event)">↑</button>`
      + `<button class="btn btn--icon btn--sm run-group-move" title="下移" ${gi >= allNamed.length - 1 ? 'disabled' : ''} onclick="moveRunGroup('${escapeOnclickArg(key)}', 1, event)">↓</button>`;
    const menuHtml = isUngrouped ? ''
      : `<button class="btn btn--icon btn--sm run-group-menu" title="重命名分组" onclick="renameRunGroup('${escapeOnclickArg(key)}', event)">✎</button>`;
    const runningHtml = runningN
      ? `<span class="run-group-running"><span class="run-dot"></span>运行中 ${runningN}</span>` : '';
    return `
      <div class="run-group">
        <div class="run-group-header${collapsed ? ' is-collapsed' : ''}" onclick="toggleRunGroup('${escapeOnclickArg(key)}', this)">
          <span class="run-group-chevron">${collapsed ? '▸' : '▾'}</span>
          <span class="run-group-name${isUngrouped ? ' is-ungrouped' : ''}">${escapeHtml(isUngrouped ? '未分组' : key)}</span>
          <span class="run-group-count">${items.length} 个项目</span>
          ${runningHtml}
          ${moveHtml}
          ${menuHtml}
        </div>
        <div class="run-group-body run-project-grid"${collapsed ? ' style="display:none"' : ''}>${items.map(runProjectCardHTML).join('')}</div>
      </div>`;
  }).join('');
}

// 单张运行项目卡片（平铺与分组视图共用）
function runProjectCardHTML(p) {
  const isMulti = p.type === 'multi-module';
  const moduleCount = (p.modules || []).length;
  const job = runningProjects[p.name];
  const command = p.runCommand || inferRunCommand(p);
  const nodeLabel = p.nodeVersion || '系统默认';
  const url = job ? (job.url || (job.port ? `http://localhost:${job.port}` : '等待地址')) : '未启动';

  const alertInfo = portOccupancyAlerts[p.name];
  let stateHtml = '';
  let actionHtml = '';

  if (job) {
    stateHtml = `<div><span class="run-dot"></span>${job.status === 'starting' ? '启动中' : '运行中'} · ${url}</div>
    <span>PID ${job.pid || '—'} · ${formatRunUptime(job.startedAt)}</span>`;
    actionHtml = `
      <button class="btn btn--danger" onclick="stopLocalRun('${escapeOnclickArg(p.name)}', event)">■ 停止</button>
      <button class="btn" onclick="openRunLog('${escapeOnclickArg(p.name)}')">查看日志</button>
      <button class="btn btn--primary" onclick="openRunUrl('${escapeOnclickArg(p.name)}', event)">打开地址</button>
    `;
  } else if (alertInfo) {
    stateHtml = `
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <strong>端口被占用</strong>
        <span>端口 ${alertInfo.port} 被 <code>${escapeHtml(alertInfo.command)}</code> (PID: ${alertInfo.pid}) 占用</span>
      </div>
    `;
    actionHtml = `
      <button class="btn btn--warning" onclick="forceReleaseAndStart('${escapeOnclickArg(p.name)}', ${alertInfo.pid})">⚡ 一键释放并启动</button>
      <button class="btn btn--primary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'start')">▶ 启动</button>
      <button class="btn" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'config')">配置</button>
    `;
  } else {
    stateHtml = '<div>○ 尚未运行</div><span>点击启动可配置命令和模块</span>';
    actionHtml = `
      <button class="btn btn--primary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'start')">▶ 启动运行</button>
      <button class="btn" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'config')">配置</button>
    `;
  }

  return `
    <div class="run-project-card" data-project="${escapeAttr(p.name)}">
      <div class="run-card-top">
        <div class="run-card-title" title="${escapeAttr(p.displayName || p.name)}">${isMulti ? '📦' : '📄'} ${escapeHtml(p.displayName || p.name)}</div>
        <span class="badge ${isMulti ? 'badge--primary' : 'badge--success'}">${isMulti ? '多模块' : '单体'}</span>
      </div>
      <div class="run-card-path" title="${escapeAttr(p.path || '')}">${escapeHtml(p.path || '')}</div>
      <div class="run-card-meta">
        <span>${escapeHtml(p.tool)}</span>
        <span>${escapeHtml(nodeLabel)}</span>
        ${isMulti ? `<span>${moduleCount} 个模块</span>` : ''}
      </div>
      <div class="run-card-command">
        <span>启动命令</span>
        <code>${escapeHtml(command)}</code>
      </div>
      <div class="run-card-state ${job ? 'active' : (alertInfo ? 'port-alert' : '')}">
        ${stateHtml}
      </div>
      <div class="run-card-actions">
        ${actionHtml}
      </div>
    </div>`;
}

// —— 项目分组：折叠态存 localStorage（纯视图偏好），分组名取自各项目 groupName ——
const RUN_UNGROUPED = '__ungrouped__';

function runGroupNames() {
  return [...new Set(projects.map(p => (p.groupName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
}

// 分组下拉选「+ 新建分组…」→ 弹输入框建组；取消/空则回退到上次有效值
async function onRunGroupSelectChange(sel) {
  if (sel.value !== '__newgroup__') { sel.dataset.prev = sel.value; return; }
  const input = await showPrompt('新建分组', { confirmText: '创建', placeholder: '分组名称' });
  const name = (input || '').trim();
  if (!name) { sel.value = sel.dataset.prev || ''; return; }
  let opt = [...sel.options].find(o => o.value === name);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.insertBefore(opt, sel.querySelector('option[value="__newgroup__"]'));
  }
  sel.value = name;
  sel.dataset.prev = name;
}

function isRunGroupCollapsed(key) {
  try { return JSON.parse(localStorage.getItem('runCollapsedGroups') || '[]').includes(key); } catch (e) { return false; }
}

function setRunGroupCollapsed(key, collapsed) {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem('runCollapsedGroups') || '[]'); } catch (e) { arr = []; }
  const i = arr.indexOf(key);
  if (collapsed && i === -1) arr.push(key);
  else if (!collapsed && i !== -1) arr.splice(i, 1);
  localStorage.setItem('runCollapsedGroups', JSON.stringify(arr));
}

function toggleRunGroup(key, headerEl) {
  const collapsed = !isRunGroupCollapsed(key);
  setRunGroupCollapsed(key, collapsed);
  headerEl.classList.toggle('is-collapsed', collapsed);
  const chevron = headerEl.querySelector('.run-group-chevron');
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
  const body = headerEl.nextElementSibling;
  if (body) body.style.display = collapsed ? 'none' : '';
}

// —— 分组排序：用户自定义顺序存 localStorage（与折叠态同路子，纯视图偏好）——
function getRunGroupOrder() {
  try { return JSON.parse(localStorage.getItem('runGroupOrder') || '[]'); } catch (e) { return []; }
}

function setRunGroupOrder(order) {
  localStorage.setItem('runGroupOrder', JSON.stringify(order));
}

// 具名分组按自定义顺序优先，未在顺序里的新组按名称补在后
function orderedRunGroups(namedKeys) {
  const saved = getRunGroupOrder().filter(k => namedKeys.includes(k));
  const rest = namedKeys.filter(k => !saved.includes(k)).sort((a, b) => a.localeCompare(b, 'zh'));
  return [...saved, ...rest];
}

// 上移/下移一个分组（dir = -1 上 / +1 下），以全部具名分组的全局顺序为基准
function moveRunGroup(key, dir, event) {
  if (event) event.stopPropagation();   // 别冒泡触发分区头折叠
  const order = orderedRunGroups([...new Set(projects.map(p => (p.groupName || '').trim()).filter(Boolean))]);
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  setRunGroupOrder(order);
  renderRunPage();
}

async function renameRunGroup(key, event) {
  if (event) event.stopPropagation();   // 别冒泡触发分区头折叠
  const input = await showPrompt('重命名分组', { defaultValue: key, confirmText: '保存', placeholder: '分组名称' });
  if (input === null) return;
  const name = input.trim();
  if (!name || name === key) return;
  const affected = projects.filter(p => (p.groupName || '').trim() === key);
  try {
    for (const p of affected) {
      await API.put(`/api/projects/${p.name}`, { groupName: name });
      p.groupName = name;
    }
    if (isRunGroupCollapsed(key)) { setRunGroupCollapsed(key, false); setRunGroupCollapsed(name, true); }
    // 同步迁移自定义排序里的条目：纯改名→原位替换；合并到已存在组→删旧条目
    const order = getRunGroupOrder();
    const oi = order.indexOf(key);
    if (oi !== -1) {
      if (order.includes(name)) order.splice(oi, 1);
      else order[oi] = name;
      setRunGroupOrder(order);
    }
    showToast('分组已重命名', `${key} → ${name}`);
    renderRunPage();
  } catch (e) {
    showAlert('重命名失败: ' + e.message, { icon: '❌' });
  }
}

function formatRunUptime(startedAt) {
  if (!startedAt) return '刚刚';
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatRunModules(job, prefix = '') {
  const modules = Array.isArray(job.moduleNames) && job.moduleNames.length
    ? job.moduleNames
    : (job.moduleName ? [job.moduleName] : []);
  return modules.length ? `${prefix}${modules.join(', ')}` : `${prefix}整体项目`;
}

function openRunModal(projectName, mode = 'start') {
  const project = projects.find(p => p.name === projectName);
  if (!project) return;
  runModalProjectName = projectName;
  runModalMode = mode;
  selectedRunModuleNames = new Set();

  const modal = document.querySelector('#runModal .modal-run');
  if (modal) modal.classList.toggle('config-mode', mode === 'config');
  document.getElementById('runModalTitle').textContent = mode === 'config' ? '本地运行配置' : '▶ 运行本地项目';
  document.getElementById('runSectionTitle').textContent = mode === 'config' ? '默认配置' : '运行配置';
  const startBtn = document.getElementById('runStartBtn');
  startBtn.textContent = mode === 'config' ? '保存配置' : '▶ 启动运行';
  startBtn.onclick = mode === 'config' ? saveLocalRunConfig : startLocalRunFromModal;
  document.getElementById('runSubtitle').textContent = `${project.displayName || project.name} · ${project.path}`;
  const nodeSelect = document.getElementById('runNodeVersion');
  nodeSelect.innerHTML = `<option value="">系统默认 (${currentNodeVersion})</option>`
    + nodeVersions.map(v => `<option value="${v}" ${v === (project.nodeVersion || '') ? 'selected' : ''}>${v}</option>`).join('');

  renderRunModulePicker(project, mode);

  document.getElementById('runCommand').value = project.runCommand || inferRunCommand(project);
  document.getElementById('runPortInput').value = project.runPort || '';

  // 分组字段：仅配置模式可见。下拉「未分组 + 已有分组 + 新建分组…」，样式与 Node 版本下拉一致
  const groupSelect = document.getElementById('runGroupSelect');
  if (groupSelect) {
    const current = (project.groupName || '').trim();
    groupSelect.innerHTML = ['<option value="">未分组</option>']
      .concat(runGroupNames().map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`))
      .concat(['<option value="__newgroup__">+ 新建分组…</option>'])
      .join('');
    groupSelect.value = current;
    groupSelect.dataset.prev = current;
  }
  const groupRow = document.getElementById('runGroupRow');
  if (groupRow) groupRow.style.display = mode === 'config' ? '' : 'none';
  if (mode === 'start') {
    const favorites = getRunFavoriteModules(project);
    const homeModuleName = (project.runHomeModule || 'home').trim() || 'home';
    selectedRunModuleNames = new Set(project.runIncludeHome !== false && favorites.some(name => name.toLowerCase() === homeModuleName.toLowerCase()) ? [homeModuleName] : []);
    renderRunModalStatus(runningProjects[projectName]);
  }
  updateRunStartBtnState();
  document.getElementById('runModal').classList.add('active');
}

function renderRunModalStatus(job) {
  const panel = document.getElementById('runStatusPanel');
  if (!panel) return;
  const project = projects.find(p => p.name === runModalProjectName);
  const quickModules = project?.type === 'multi-module' ? getRunFavoriteModules(project) : [];
  const quickHtml = project?.type === 'multi-module'
    ? `
      <div class="run-quick-panel">
        <div class="run-quick-title">快捷运行模块</div>
        ${quickModules.length
          ? `<div class="run-quick-grid">
              ${quickModules.map(name => `
                <button type="button" class="run-quick-module${selectedRunModuleNames.has(name) ? ' active' : ''}" data-module="${escapeAttr(name)}" onclick="toggleRunQuickModule('${escapeOnclickArg(name)}')" title="${escapeAttr(name)}">
                  <span class="run-quick-check">${selectedRunModuleNames.has(name) ? '✓' : ''}</span>
                  <strong>${escapeHtml(name)}</strong>
                </button>
              `).join('')}
            </div>`
          : '<div class="run-quick-empty">先在配置里收藏常用模块，启动时会显示在这里。</div>'}
      </div>`
    : '';

  if (!job) {
    panel.innerHTML = `${quickHtml}<div class="run-status-empty">勾选一个或多个模块后启动，本地服务日志会显示在统一日志弹窗中。</div>`;
    return;
  }
  const url = job.url || (job.port ? `http://localhost:${job.port}` : '等待地址');
  panel.innerHTML = `${quickHtml}
    <div class="run-live-card">
      <div class="run-live-state"><span class="run-dot"></span>${job.status === 'starting' ? '启动中' : '运行中'}</div>
      <div class="run-live-url">${url}</div>
      <div class="run-live-meta">PID ${job.pid || '—'} · ${formatRunModules(job)} · ${job.command || ''}</div>
      <div class="run-live-actions">
        <button class="btn" onclick="openRunLog('${escapeOnclickArg(job.projectName)}')">查看日志</button>
        <button class="btn" onclick="openRunUrl('${escapeOnclickArg(job.projectName)}', event)">打开地址</button>
        <button class="btn btn--danger" onclick="stopLocalRun('${escapeOnclickArg(job.projectName)}', event)">停止运行</button>
      </div>
    </div>`;
}

// 统一的本地启动执行：POST /start + 写入运行态 + 打开日志壳 + 重渲，供模态启动与强释启动共用，
// 避免两条路径参数构造（autoRestart/模块/命令）分叉
async function startRunJob(project, { moduleNames = [], command = '', nodeVersion = '', autoRestart = false } = {}) {
  const data = await API.post('/api/run/start', {
    projectName: project.name,
    command: command || project.runCommand || inferRunCommand(project),
    moduleNames,
    nodeVersion,
    autoRestart: !!autoRestart,
  });
  runningProjects[project.name] = data;
  showRunLogShell(data);
  renderRunPage();
  return data;
}

async function startLocalRunFromModal() {
  const project = projects.find(p => p.name === runModalProjectName);
  if (!project) return;
  let intent = null; // 本次启动意图，端口冲突走强释时透传，避免丢 autoRestart/模块选择
  try {
    document.getElementById('runStartBtn').disabled = true;

    const config = await persistLocalRunConfig(project);
    if (!config) return;

    const moduleNames = project.type === 'multi-module' ? [...selectedRunModuleNames] : [];
    if (project.type === 'multi-module' && moduleNames.length === 0) {
      await showAlert('请选择要运行的模块。可以先在配置里收藏常用模块，再从启动弹窗中勾选一个或多个模块。', { icon: '⚠️' });
      return;
    }

    const autoRestart = !!document.getElementById('runAutoRestart')?.checked;
    intent = { moduleNames, command: config.command, nodeVersion: config.nodeVersion, autoRestart };
    await startRunJob(project, intent);
    closeModal('runModal');
    showToast('▶ 本地运行已启动', project.displayName || project.name);
  } catch (e) {
    const isPortInUse = e.message && (e.message.includes('已被外部进程') || e.message.includes('EADDRINUSE'));
    if (isPortInUse) {
      let port = project.runPort || (runningProjects[project.name]?.port);
      if (!port && e.message) {
        const match = e.message.match(/端口\s*(\d{2,5})/);
        if (match && match[1]) port = match[1];
      }
      if (port) {
        await checkPortOccupancyForProject(project.name, port);
        renderRunPage();
        const alertInfo = portOccupancyAlerts[project.name];
        if (alertInfo && alertInfo.pid) {
          closeModal('runModal');
          const confirmRelease = await showConfirm(
            `启动失败：端口 ${port} 已被进程 ${alertInfo.command} (PID: ${alertInfo.pid}) 占用。\n是否自动释放端口并重新启动？`,
            { icon: '⚠️', confirmText: '释放并启动', cancelText: '取消' }
          );
          if (confirmRelease) {
            await forceReleaseAndStart(project.name, alertInfo.pid, intent);
          }
          return;
        }
      }
    }
    showAlert('启动失败: ' + e.message, { icon: '❌' });
  } finally {
    updateRunStartBtnState();
  }
}

async function saveLocalRunConfig() {
  const project = projects.find(p => p.name === runModalProjectName);
  if (!project) return;
  try {
    document.getElementById('runStartBtn').disabled = true;
    const config = await persistLocalRunConfig(project);
    if (!config) return;
    closeModal('runModal');
    showToast('配置已保存', project.displayName || project.name);
    renderRunPage();
  } catch (e) {
    showAlert('保存配置失败: ' + e.message, { icon: '❌' });
  } finally {
    updateRunStartBtnState();
  }
}

async function persistLocalRunConfig(project) {
  const command = document.getElementById('runCommand').value.trim();
  if (!command) {
    await showAlert('请输入启动命令', { icon: '⚠️' });
    return null;
  }

  const runPort = document.getElementById('runPortInput')?.value.trim() || '';
  // 端口校验：空=自动推断放行；非空必须为 1-65535 整数，否则非法值会破坏端口推断/占用检测
  if (runPort && !/^\d+$/.test(runPort)) {
    await showAlert('服务端口只能填数字（留空则自动推断）', { icon: '⚠️' });
    return null;
  }
  if (runPort && (Number(runPort) < 1 || Number(runPort) > 65535)) {
    await showAlert('服务端口需在 1–65535 之间', { icon: '⚠️' });
    return null;
  }
  const nodeVersion = document.getElementById('runNodeVersion').value;
  const favoriteRunModules = runModalMode === 'config' ? getCheckedRunFavoriteModules() : normalizeModuleList(project.favoriteRunModules);
  const runIncludeHome = !!document.getElementById('runIncludeHome')?.checked;
  const homeModuleName = getRunHomeModuleName();
  // 分组仅配置模式可编辑；启动模式沿用项目现值，避免被隐藏字段覆盖
  const groupSel = document.getElementById('runGroupSelect');
  const groupName = (runModalMode === 'config' && groupSel && groupSel.value !== '__newgroup__')
    ? groupSel.value.trim()
    : (project.groupName || '');

  await API.put(`/api/projects/${project.name}`, { runCommand: command, runPort, runHomeModule: homeModuleName, runIncludeHome, favoriteRunModules, nodeVersion, groupName });
  project.runCommand = command;
  project.runPort = runPort;
  project.runHomeModule = homeModuleName;
  project.runIncludeHome = runIncludeHome;
  project.favoriteRunModules = favoriteRunModules;
  project.nodeVersion = nodeVersion;
  project.groupName = groupName;
  return { command, nodeVersion, favoriteRunModules, runIncludeHome, homeModuleName, runPort };
}

function showRunLogShell(job) {
  currentRunId = job.id;
  currentDeployId = null;
  activeTask = { id: job.id, projectName: job.projectName, isRunning: ['starting', 'running'].includes(job.status), taskKind: 'run' };
  document.getElementById('logModal').classList.remove('run-compile-error', 'run-compile-warning');
  document.getElementById('logTitle').textContent = '运行日志';
  document.getElementById('logSubtitle').textContent = `${job.projectName}${formatRunModules(job, ' · ')}`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'flex';
  document.getElementById('resultIcon').textContent = '▶';
  document.getElementById('resultText').textContent = job.status === 'starting' ? '正在启动本地服务' : '本地服务运行中';
  document.getElementById('progressBar').style.width = job.status === 'starting' ? '35%' : '100%';
  document.getElementById('progressText').textContent = job.status === 'starting' ? '启动中' : '运行中';
  document.getElementById('progressSteps').innerHTML = ['启动中', '运行中'].map((s, i) =>
    `<div class="step${i === 0 ? ' active' : ''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');
  document.getElementById('logModal').classList.add('active');
  updateLogModalCloseBtn();
}

async function openRunLog(projectName) {
  const job = runningProjects[projectName];
  if (!job) { showToast('该服务已不在运行', projectName); return; }
  // 先用本地 job 立即打开日志弹窗并占位，避免接口慢时点击「查看日志」毫无反馈；
  // 同时建立实时通道（showRunLogShell 设 currentRunId），后续 WS run-log 可继续追加
  showRunLogShell(job);
  appendLog('正在加载历史日志…', 'info');
  try {
    const data = await API.get(`/api/run/${job.id}/logs`);
    document.getElementById('logTerminal').innerHTML = '';
    (data.logs || []).forEach(log => appendLog(log.text, log.type));
    updateRunLogStatus(data);
  } catch (e) {
    appendLog('加载历史日志失败: ' + e.message, 'error');
  }
}

async function openRunUrl(projectName, ev) {
  const job = runningProjects[projectName];
  if (!job) { showToast('该服务已不在运行', projectName); return; }
  // 锁按钮防连点开多个浏览器标签
  await withButtonBusy(ev && ev.currentTarget, null, async () => {
    try {
      const data = await API.post(`/api/run/${job.id}/open`, {});
      const urls = data.urls || (data.url ? [data.url] : []);
      if (urls.length > 1) {
        showToast(`已打开 ${urls.length} 个模块页面`, urls.join('  ·  '));
      } else {
        showToast('已打开本地地址', urls[0] || '');
      }
    } catch (e) {
      showAlert('打开失败: ' + e.message, { icon: '❌' });
    }
  });
}

async function stopLocalRun(projectName, ev) {
  const job = runningProjects[projectName];
  if (!job) { showToast('该服务已不在运行', projectName); return; }
  // 停止有可见延迟（依赖 WS 回推移除卡片），锁按钮防连点重复 stop
  await withButtonBusy(ev && ev.currentTarget, '停止中…', async () => {
    try {
      await API.post(`/api/run/${job.id}/stop`, {});
      showToast('正在停止本地服务', projectName);
    } catch (e) {
      showAlert('停止失败: ' + e.message, { icon: '❌' });
    }
  });
}

// ========== 批量停止 ==========
async function batchStopAllRun() {
  const runningNames = Object.keys(runningProjects);
  if (runningNames.length === 0) {
    showToast('没有正在运行的服务');
    return;
  }
  if (!await showConfirm(`确定停止全部 ${runningNames.length} 个运行中的服务？`, { icon: '⚠️', confirmText: '全部停止', danger: true })) return;
  await withButtonBusy(document.getElementById('btnBatchStopRun'), '停止中…', async () => {
    try {
      await API.post('/api/run/batch-stop', { projectNames: runningNames });
      showToast(`正在停止 ${runningNames.length} 个服务`);
    } catch (e) {
      showAlert('批量停止失败: ' + e.message, { icon: '❌' });
    }
  });
}

// ========== 运行历史 ==========
async function showRunHistory() {
  const list = document.getElementById('runHistoryList');
  document.getElementById('runHistoryModal').classList.add('active');
  // 先清空旧内容并显示加载态：避免二次打开时旧数据闪现、空白弹窗体
  renderState(list, { kind: 'loading', title: '加载中…', sm: true });
  try {
    const history = await API.get('/api/run/history');
    if (!history || history.length === 0) {
      renderState(list, { kind: 'empty', icon: '📋', title: '暂无运行历史记录', sm: true });
      return;
    }
    list.innerHTML = `<table class="ha-table run-history-table">
      <thead><tr><th>时间</th><th>项目</th><th>模块</th><th>状态</th><th>运行时长</th><th>操作</th></tr></thead>
      <tbody>${history.map(h => {
        const time = new Date(h.startedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        // 三档区分：自然成功 / 用户手动停止 / 异常崩溃，便于排查「是我停的还是它崩的」
        let statusCls, statusText;
        if (h.status === 'success') { statusCls = 'status-success'; statusText = '已结束'; }
        else if (h.status === 'stopped') { statusCls = ''; statusText = '手动停止'; }
        else { statusCls = 'status-fail'; statusText = '异常退出'; }
        const mods = (h.moduleNames || []).join(', ') || '—';
        return `<tr>
          <td class="ha-time">${time}</td>
          <td class="ha-project" title="${escapeAttr(h.projectName)}">${escapeHtml(h.projectName)}</td>
          <td class="ha-modules" title="${escapeAttr(mods)}">${escapeHtml(mods)}</td>
          <td class="${statusCls}">${statusText}</td>
          <td>${h.duration || '—'}</td>
          <td><button class="btn btn--icon btn--sm btn--danger" onclick="deleteRunHistoryItem('${h.id}', event)" title="删除">⌫</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (e) {
    renderState(list, { kind: 'error', icon: '⚠️', title: '加载失败', desc: e.message, sm: true });
  }
}

async function deleteRunHistoryItem(id, ev) {
  // 删除不可逆、按钮又是小图标易误触，与「清空历史」确认粒度对齐
  if (!await showConfirm('确定删除这条运行记录？', { icon: '🗑️', danger: true, confirmText: '删除' })) return;
  await withButtonBusy(ev && ev.currentTarget, '', async () => {
    try {
      await API.del(`/api/run/history/${id}`);
      showRunHistory();
    } catch (e) {
      showAlert('删除失败: ' + e.message, { icon: '❌' });
    }
  });
}

async function clearRunHistory(ev) {
  if (!await showConfirm('确定清空所有运行历史记录？', { icon: '🗑️', danger: true, confirmText: '清空' })) return;
  await withButtonBusy(ev && ev.currentTarget, '清空中…', async () => {
    try {
      await API.del('/api/run/history');
      showRunHistory();
      showToast('🗑 运行历史已清空');
    } catch (e) {
      showAlert('清空失败: ' + e.message, { icon: '❌' });
    }
  });
}

function updateRunLogStatus(job) {
  if (job.id !== currentRunId) return;
  const isRunning = ['starting', 'running'].includes(job.status);
  const logModal = document.getElementById('logModal');
  logModal.classList.toggle('run-compile-error', job.compileStatus === 'error');
  logModal.classList.toggle('run-compile-warning', job.compileStatus === 'warning');
  if (activeTask && activeTask.taskKind === 'run') activeTask.isRunning = isRunning;
  if (job.status === 'starting') {
    setStepActive(0);
    document.getElementById('progressBar').style.width = '35%';
    document.getElementById('progressText').textContent = '启动中';
    document.getElementById('resultIcon').textContent = '▶';
    document.getElementById('resultText').textContent = '正在启动本地服务';
  } else if (job.status === 'running') {
    setStepDone(0);
    setStepActive(1);
    document.getElementById('progressBar').style.width = '100%';
    if (job.compileStatus === 'error') {
      document.getElementById('progressText').textContent = '编译报错';
      document.getElementById('resultIcon').textContent = '❌';
      document.getElementById('resultText').textContent = `本地项目编译报错：${job.compileError || '请查看日志'}`;
    } else if (job.compileStatus === 'compiling') {
      document.getElementById('progressText').textContent = '编译中';
      document.getElementById('resultIcon').textContent = '●';
      document.getElementById('resultText').textContent = '本地服务运行中，正在重新编译';
    } else {
      document.getElementById('progressText').textContent = job.compileStatus === 'warning' ? '有警告' : '运行中';
      document.getElementById('resultIcon').textContent = '✅';
      document.getElementById('resultText').textContent = job.url ? `本地服务运行中 · ${job.url}` : '本地服务运行中';
    }
  } else {
    document.querySelectorAll('#progressSteps .step').forEach(s => s.classList.add('done'));
    document.getElementById('progressBar').style.width = '100%';
    document.getElementById('progressText').textContent = job.status === 'error' ? '失败' : '已停止';
    document.getElementById('resultIcon').textContent = job.status === 'error' ? '❌' : '■';
    document.getElementById('resultText').textContent = job.status === 'error' ? `本地服务异常退出：${job.error || '未知错误'}` : '本地服务已停止';
  }
  updateLogModalCloseBtn();
  if (runModalProjectName === job.projectName) renderRunModalStatus(isRunning ? job : null);
}

async function loadRunStatuses() {
  try {
    const list = await API.get('/api/run/status');
    runningProjects = {};
    (list || []).forEach(job => {
      if (['starting', 'running'].includes(job.status)) {
        runningProjects[job.projectName] = job;
      }
    });
  } catch (e) {
    runningProjects = {};
  }
}

// 本地运行页可见期间的轮询：① 刷新卡片「运行时长」文本（WS 仅状态变化时推送，
// 稳定运行的服务不会触发重渲，时长会停在旧值）；② 与后端对账（WS 丢事件/瞬断时
// 内存运行态可能失真）。仅在有运行中项目时打扰后端，空闲不轮询。离开页面统一清理。
let runPagePollTimer = null;
function startRunPagePolling() {
  stopRunPagePolling();
  runPagePollTimer = setInterval(() => {
    if (!Object.keys(runningProjects).length) return;
    loadRunStatuses().then(() => renderRunPage());
  }, 15000);
}
function stopRunPagePolling() {
  if (runPagePollTimer) { clearInterval(runPagePollTimer); runPagePollTimer = null; }
}

// opts（可选）= 来自启动弹窗的本次启动意图 { moduleNames, command, nodeVersion, autoRestart }；
// 无 opts 时为卡片「一键释放并启动」：多模块取收藏、收藏为空则开弹窗让用户选
async function forceReleaseAndStart(projectName, pid, opts = null) {
  const project = projects.find(p => p.name === projectName);
  if (!project) { showToast('项目未找到', projectName); return; }
  try {
    showToast('⏳ 正在强释端口并重新启动...', projectName);
    await API.post('/api/run/force-release', { pid });
    delete portOccupancyAlerts[projectName];

    // 轮询确认端口真正释放（替代固定 800ms——TIME_WAIT/回收慢时 800ms 可能不够，
    // 重启会再次 EADDRINUSE）；最多约 3s，确认释放或超时后再启动
    const port = project.runPort || '';
    if (port) {
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 250));
        try { const chk = await API.get(`/api/run/port-check/${port}`); if (!chk.inUse) break; } catch { break; }
      }
    } else {
      await new Promise(r => setTimeout(r, 500));
    }

    // 模块意图：优先用弹窗传入；否则多模块取收藏，收藏为空则开弹窗让用户确认
    let moduleNames = opts ? opts.moduleNames : null;
    if (moduleNames == null) {
      moduleNames = project.type === 'multi-module' ? getRunFavoriteModules(project) : [];
      if (project.type === 'multi-module' && moduleNames.length === 0) {
        openRunModal(projectName, 'start');
        return;
      }
    }

    await startRunJob(project, {
      moduleNames,
      command: opts ? opts.command : '',
      nodeVersion: opts ? opts.nodeVersion : (project.nodeVersion || ''),
      autoRestart: opts ? opts.autoRestart : false,
    });
    showToast('▶ 本地运行已成功强释并启动', project.displayName || project.name);
  } catch (e) {
    // 启动仍失败时复用端口诊断（可能换了占用进程），而非直接 alert 死路
    if (project.runPort) {
      try { await checkPortOccupancyForProject(project.name, project.runPort); renderRunPage(); } catch { /* 诊断失败不阻塞提示 */ }
    }
    showAlert('强释启动失败: ' + e.message, { icon: '❌' });
  }
}
