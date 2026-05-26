// ========== Module: Report (Git 周报) ==========
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

// 仓库列表（支持分组折叠 + 拖拽排序）
let rptCollapsedGroups = new Set();
let rptSortableInstance = null;

function rptRenderRepos() {
  const el = document.getElementById('rptRepoList');
  const search = (document.getElementById('rptRepoSearch')?.value || '').toLowerCase();
  document.getElementById('rptRepoCount').textContent = rptRepos.length;
  const filtered = rptRepos.map((r, i) => ({...r, idx: i})).filter(r =>
    !search || r.repo.toLowerCase().includes(search) || (r.branch||'').toLowerCase().includes(search) || (r.group||'').toLowerCase().includes(search)
  );

  // 按 group 分组
  const groups = new Map(); // group -> items[]
  filtered.forEach(r => {
    const g = (r.group || '').trim() || '__ungrouped__';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });

  let html = '';
  for (const [group, items] of groups) {
    const isUngrouped = group === '__ungrouped__';
    const isCollapsed = rptCollapsedGroups.has(group);

    if (!isUngrouped && groups.size > 1) {
      html += `<div class="rpt-group-header" onclick="rptToggleGroup('${rptEsc(group)}')">
        <span class="rpt-group-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="rpt-group-name">${rptEsc(group)}</span>
        <span class="rpt-group-count">${items.length}</span>
      </div>`;
    }

    if (!isCollapsed || isUngrouped || groups.size <= 1) {
      html += items.map(r => `
        <div class="rpt-repo-item" data-idx="${r.idx}">
          <div class="rpt-repo-drag-handle" title="拖拽排序">⠿</div>
          ${rptRepos.length > 1 ? `<button class="rpt-repo-del" onclick="rptDelRepo(${r.idx})">×</button>` : ''}
          <div class="rfield"><label>仓库地址</label><input value="${rptEsc(r.repo)}" onchange="rptRepos[${r.idx}].repo=this.value" placeholder="http://.../group/project.git"></div>
          <div class="rfield-row">
            <div class="rfield"><label>分支</label><input value="${rptEsc(r.branch||'')}" onchange="rptRepos[${r.idx}].branch=this.value" placeholder="默认主分支"></div>
            <div class="rfield"><label>分组</label><input value="${rptEsc(r.group||'')}" onchange="rptRepos[${r.idx}].group=this.value" placeholder="可选"></div>
          </div>
        </div>
      `).join('');
    }
  }

  el.innerHTML = html || '<div style="text-align:center;color:var(--text-muted);padding:20px">暂无仓库</div>';

  // 初始化 SortableJS
  rptInitSortable();
}

function rptInitSortable() {
  if (rptSortableInstance) {
    rptSortableInstance.destroy();
    rptSortableInstance = null;
  }
  const el = document.getElementById('rptRepoList');
  if (!el || !window.Sortable) return;

  rptSortableInstance = Sortable.create(el, {
    handle: '.rpt-repo-drag-handle',
    animation: 150,
    ghostClass: 'rpt-repo-ghost',
    chosenClass: 'rpt-repo-chosen',
    dragClass: 'rpt-repo-drag',
    filter: '.rpt-group-header',
    onEnd: (evt) => {
      // 获取拖拽前后的真实索引
      const items = el.querySelectorAll('.rpt-repo-item[data-idx]');
      const newOrder = [...items].map(item => parseInt(item.dataset.idx));
      // 重建 rptRepos 数组
      const reordered = newOrder.map(idx => rptRepos[idx]).filter(Boolean);
      // 补上未显示的（被搜索过滤掉的）
      const shown = new Set(newOrder);
      rptRepos.forEach((r, i) => { if (!shown.has(i)) reordered.push(r); });
      rptRepos.splice(0, rptRepos.length, ...reordered);
      // 重新渲染以更新 data-idx
      rptRenderRepos();
    },
  });
}

function rptToggleGroup(group) {
  if (rptCollapsedGroups.has(group)) rptCollapsedGroups.delete(group);
  else rptCollapsedGroups.add(group);
  rptRenderRepos();
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
  document.getElementById('batchImportTextarea').value = '';
  document.getElementById('batchImportPreview').innerHTML = '';
  document.getElementById('batchImportModal').classList.add('active');
}

function batchImportPreview() {
  const text = document.getElementById('batchImportTextarea').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const preview = document.getElementById('batchImportPreview');
  if (lines.length === 0) {
    preview.innerHTML = '<div style="color:var(--text-muted);font-size:13px">输入仓库地址后自动预览</div>';
    return;
  }
  const items = lines.map(line => {
    const parts = line.split(',').map(s => s.trim());
    const repo = parts[0], branch = parts[1] || '';
    const exists = rptRepos.some(r => r.repo === repo);
    return `<div class="batch-preview-item ${exists ? 'exists' : ''}">
      <span class="batch-preview-repo">${escapeHtml(repo)}</span>
      ${branch ? `<span class="batch-preview-branch">${escapeHtml(branch)}</span>` : ''}
      ${exists ? '<span class="batch-preview-tag">已存在</span>' : '<span class="batch-preview-tag new">新增</span>'}
    </div>`;
  });
  preview.innerHTML = items.join('');
}

function confirmBatchImport() {
  const text = document.getElementById('batchImportTextarea').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let count = 0;
  lines.forEach(line => {
    const parts = line.split(',').map(s => s.trim());
    const repo = parts[0], branch = parts[1] || '';
    if (repo && !rptRepos.some(r => r.repo === repo)) { rptRepos.push({ repo, branch, group: '' }); count++; }
  });
  closeModal('batchImportModal');
  rptRenderRepos();
  if (count > 0) showToast(`✅ 已导入 ${count} 个仓库`);
  else showToast('没有新增仓库（全部已存在）');
}

// ========== 周报配置导入/导出 ==========
function rptExportConfig() {
  const config = {
    token: document.getElementById('rptToken').value,
    author: document.getElementById('rptAuthor').value,
    repos: rptRepos.filter(r => r.repo.trim()),
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `devtools-report-config.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📄 配置已导出');
}

function rptImportConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      if (config.token) document.getElementById('rptToken').value = config.token;
      if (config.author) document.getElementById('rptAuthor').value = config.author;
      if (Array.isArray(config.repos) && config.repos.length > 0) {
        rptRepos = config.repos.map(r => ({ repo: r.repo || '', branch: r.branch || '', group: r.group || '' }));
        rptRenderRepos();
      }
      showToast(`✅ 配置已导入（${config.repos?.length || 0} 个仓库）`);
    } catch (err) {
      showAlert('导入失败：文件格式不正确', { icon: '❌' });
    }
  };
  input.click();
}
