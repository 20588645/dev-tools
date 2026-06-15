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

  moduleRow.style.display = modules.length ? '' : 'none';
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
    : '';
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
  const configuredRunCount = projects.filter(p => p.runCommand).length;
  overview.innerHTML = `
    <div class="run-stat-card"><span>可运行项目</span><strong>${projects.length}</strong></div>
    <div class="run-stat-card"><span>运行中</span><strong>${runningCount}</strong></div>
    <div class="run-stat-card"><span>已保存命令</span><strong>${configuredRunCount}</strong></div>
  `;

  // 显示/隐藏批量停止按钮
  const batchStopBtn = document.getElementById('btnBatchStopRun');
  if (batchStopBtn) batchStopBtn.style.display = runningCount > 0 ? '' : 'none';

  if (list.length === 0) {
    // 区分两种空态：从未添加项目 → 引导添加；有项目但被搜索/筛选过滤光 → 提示无匹配
    if (projects.length === 0) {
      grid.innerHTML = `<div class="run-empty run-empty-guide">
        <div class="run-empty-icon">📂</div>
        <div>还没有可运行的项目</div>
        <button class="btn-primary" onclick="showAddProject()">+ 添加项目</button>
      </div>`;
    } else {
      grid.innerHTML = '<div class="run-empty">没有匹配的项目</div>';
    }
    return;
  }

  grid.innerHTML = list.map(p => {
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
        <button class="btn-danger" onclick="stopLocalRun('${escapeOnclickArg(p.name)}', event)">■ 停止</button>
        <button class="btn-secondary" onclick="openRunLog('${escapeOnclickArg(p.name)}')">查看日志</button>
        <button class="btn-primary" onclick="openRunUrl('${escapeOnclickArg(p.name)}', event)">打开地址</button>
      `;
    } else {
      if (alertInfo) {
        stateHtml = `
          <div class="alert-icon">⚠️</div>
          <div class="alert-content">
            <strong>端口被占用</strong>
            <span>端口 ${alertInfo.port} 被 <code>${escapeHtml(alertInfo.command)}</code> (PID: ${alertInfo.pid}) 占用</span>
          </div>
        `;
        actionHtml = `
          <button class="btn-warning" onclick="forceReleaseAndStart('${escapeOnclickArg(p.name)}', ${alertInfo.pid})">⚡ 一键释放并启动</button>
          <button class="btn-primary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'start')">▶ 启动</button>
          <button class="btn-secondary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'config')">配置</button>
        `;
      } else {
        stateHtml = '<div>○ 尚未运行</div><span>点击启动可配置命令和模块</span>';
        actionHtml = `
          <button class="btn-primary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'start')">▶ 启动运行</button>
          <button class="btn-secondary" onclick="openRunModal('${escapeOnclickArg(p.name)}', 'config')">配置</button>
        `;
      }
    }

    return `
      <div class="run-project-card" data-project="${escapeAttr(p.name)}">
        <div class="run-card-top">
          <div class="run-card-title">${isMulti ? '📦' : '📄'} ${escapeHtml(p.displayName || p.name)}</div>
          <span class="card-badge ${isMulti ? 'badge-multi' : 'badge-single'}">${isMulti ? '多模块' : '单体'}</span>
        </div>
        <div class="run-card-path">${escapeHtml(p.path || '')}</div>
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
  }).join('');
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
  if (mode === 'start') {
    const favorites = getRunFavoriteModules(project);
    const homeModuleName = (project.runHomeModule || 'home').trim() || 'home';
    selectedRunModuleNames = new Set(project.runIncludeHome !== false && favorites.some(name => name.toLowerCase() === homeModuleName.toLowerCase()) ? [homeModuleName] : []);
    renderRunModalStatus(runningProjects[projectName]);
  }
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
        <button class="btn-secondary" onclick="openRunLog('${escapeOnclickArg(job.projectName)}')">查看日志</button>
        <button class="btn-secondary" onclick="openRunUrl('${escapeOnclickArg(job.projectName)}', event)">打开地址</button>
        <button class="btn-danger" onclick="stopLocalRun('${escapeOnclickArg(job.projectName)}', event)">停止运行</button>
      </div>
    </div>`;
}

async function startLocalRunFromModal() {
  try {
    const project = projects.find(p => p.name === runModalProjectName);
    if (!project) return;
    document.getElementById('runStartBtn').disabled = true;

    const config = await persistLocalRunConfig(project);
    if (!config) return;

    const { command, nodeVersion } = config;
    const moduleNames = project.type === 'multi-module' ? [...selectedRunModuleNames] : [];

    if (project.type === 'multi-module' && moduleNames.length === 0) {
      await showAlert('请选择要运行的模块。可以先在配置里收藏常用模块，再从启动弹窗中勾选一个或多个模块。', { icon: '⚠️' });
      return;
    }

    const autoRestart = !!document.getElementById('runAutoRestart')?.checked;
    const data = await API.post('/api/run/start', { projectName: project.name, command, moduleNames, nodeVersion, autoRestart });
    runningProjects[project.name] = data;
    closeModal('runModal');
    showRunLogShell(data);
    showToast('▶ 本地运行已启动', project.displayName || project.name);
    renderRunPage();
  } catch (e) {
    const project = projects.find(p => p.name === runModalProjectName);
    const isPortInUse = e.message && (e.message.includes('已被外部进程') || e.message.includes('EADDRINUSE'));
    if (isPortInUse && project) {
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
            await forceReleaseAndStart(project.name, alertInfo.pid);
          }
          return;
        }
      }
    }
    showAlert('启动失败: ' + e.message, { icon: '❌' });
  } finally {
    const btn = document.getElementById('runStartBtn');
    if (btn) btn.disabled = false;
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
    document.getElementById('runStartBtn').disabled = false;
  }
}

async function persistLocalRunConfig(project) {
  const command = document.getElementById('runCommand').value.trim();
  if (!command) {
    await showAlert('请输入启动命令', { icon: '⚠️' });
    return null;
  }

  const runPort = document.getElementById('runPortInput')?.value.trim() || '';
  const nodeVersion = document.getElementById('runNodeVersion').value;
  const favoriteRunModules = runModalMode === 'config' ? getCheckedRunFavoriteModules() : normalizeModuleList(project.favoriteRunModules);
  const runIncludeHome = !!document.getElementById('runIncludeHome')?.checked;
  const homeModuleName = getRunHomeModuleName();

  await API.put(`/api/projects/${project.name}`, { runCommand: command, runPort, runHomeModule: homeModuleName, runIncludeHome, favoriteRunModules, nodeVersion });
  project.runCommand = command;
  project.runPort = runPort;
  project.runHomeModule = homeModuleName;
  project.runIncludeHome = runIncludeHome;
  project.favoriteRunModules = favoriteRunModules;
  project.nodeVersion = nodeVersion;
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
  if (!job) return;
  try {
    const data = await API.get(`/api/run/${job.id}/logs`);
    showRunLogShell(data);
    (data.logs || []).forEach(log => appendLog(log.text, log.type));
    updateRunLogStatus(data);
  } catch (e) {
    showAlert('加载运行日志失败: ' + e.message, { icon: '❌' });
  }
}

async function openRunUrl(projectName, ev) {
  const job = runningProjects[projectName];
  if (!job) return;
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
  if (!job) return;
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
  document.getElementById('runHistoryModal').classList.add('active');
  try {
    const history = await API.get('/api/run/history');
    const list = document.getElementById('runHistoryList');
    if (!history || history.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">暂无运行历史记录</div>';
      return;
    }
    list.innerHTML = `<table class="ha-table">
      <thead><tr><th>时间</th><th>项目</th><th>模块</th><th>状态</th><th>运行时长</th><th>操作</th></tr></thead>
      <tbody>${history.map(h => {
        const time = new Date(h.startedAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        const statusCls = h.status === 'success' || h.status === 'stopped' ? 'status-success' : 'status-fail';
        const statusText = h.status === 'success' || h.status === 'stopped' ? '正常退出' : '异常退出';
        const mods = (h.moduleNames || []).join(', ') || '—';
        return `<tr>
          <td class="ha-time">${time}</td>
          <td class="ha-project">${escapeHtml(h.projectName)}</td>
          <td>${escapeHtml(mods)}</td>
          <td class="${statusCls}">${statusText}</td>
          <td>${h.duration || '—'}</td>
          <td><button class="btn-icon danger" onclick="deleteRunHistoryItem('${h.id}')" title="删除">⌫</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (e) {
    document.getElementById('runHistoryList').innerHTML = `<div style="color:var(--danger);padding:20px">加载失败: ${e.message}</div>`;
  }
}

async function deleteRunHistoryItem(id) {
  // 删除不可逆、按钮又是小图标易误触，与「清空历史」确认粒度对齐
  if (!await showConfirm('确定删除这条运行记录？', { icon: '🗑️', danger: true, confirmText: '删除' })) return;
  try {
    await API.del(`/api/run/history/${id}`);
    showRunHistory();
  } catch (e) {
    showAlert('删除失败: ' + e.message, { icon: '❌' });
  }
}

async function clearRunHistory() {
  if (!await showConfirm('确定清空所有运行历史记录？', { icon: '🗑️', danger: true, confirmText: '清空' })) return;
  try {
    await API.del('/api/run/history');
    showRunHistory();
    showToast('🗑 运行历史已清空');
  } catch (e) {
    showAlert('清空失败: ' + e.message, { icon: '❌' });
  }
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

async function forceReleaseAndStart(projectName, pid) {
  try {
    showToast('⏳ 正在强释端口并重新启动...', projectName);
    await API.post('/api/run/force-release', { pid });
    delete portOccupancyAlerts[projectName];
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const project = projects.find(p => p.name === projectName);
    if (!project) {
      showToast('项目未找到', projectName);
      return;
    }

    const moduleNames = project.type === 'multi-module' ? getRunFavoriteModules(project) : [];
    if (project.type === 'multi-module' && moduleNames.length === 0) {
      openRunModal(projectName, 'start');
      return;
    }

    const data = await API.post('/api/run/start', {
      projectName: project.name,
      command: project.runCommand || inferRunCommand(project),
      moduleNames,
      nodeVersion: project.nodeVersion || '',
    });
    runningProjects[project.name] = data;
    showRunLogShell(data);
    showToast('▶ 本地运行已成功强释并启动', project.displayName || project.name);
    renderRunPage();
  } catch (e) {
    showAlert('强释启动失败: ' + e.message, { icon: '❌' });
  }
}
