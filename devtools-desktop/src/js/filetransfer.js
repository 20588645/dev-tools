// ========== filetransfer.js — 文件传输页（FileZilla 式双栏 SFTP）==========
// T4：页面骨架 + 菜单 + 会话连接栏（驱动 /api/sftp 持久会话）。
// T5：双栏目录浏览 —— 本地 /api/fs/local/list、远程 /api/sftp/:sid/list；双击进目录、
//     上一级 / 主目录(默认目录) / 刷新 / 面包屑导航。新建/删除在 T6，上传下载在 T7。

// 会话
let ftSessionId = null;
let ftCurrentServer = null;
let ftKeepaliveTimer = null;
const FT_KEEPALIVE_MS = 60 * 1000; // 1min 心跳，远低于后端 5min 空闲回收

// 当前目录态
let ftLocalPath = '';
let ftLocalParent = null;
let ftLocalHomeDir = '';
let ftRemotePath = '';
let ftRemoteDefault = '.';

// 传输（T7）：选中行 + 任务表（taskId -> 进度态）
let ftLocalSel = null;
let ftRemoteSel = null;
const ftTasks = new Map();

let ftWired = false; // 事件委托只绑一次

// 进入页面：绑事件 + 刷新服务器下拉 + 同步会话态；本地栏首次自动列家目录
function initFileTransfer() {
  ftWireOnce();
  ftRenderServerOptions();
  ftRenderQueue();
  ftSyncSessionUI();
  if (!ftLocalPath) ftLoadLocal('');
}

// 双击进目录 / 点面包屑跳转：用事件委托，避免给每行内联 onclick（转义 + 重绑都麻烦）
function ftWireOnce() {
  if (ftWired) return;
  ftWired = true;
  const lb = document.getElementById('ftLocalBody');
  const rb = document.getElementById('ftRemoteBody');
  const lc = document.getElementById('ftLocalCrumb');
  const rc = document.getElementById('ftRemoteCrumb');
  if (lb) lb.addEventListener('dblclick', (e) => ftOnRowDblClick(e, 'local'));
  if (rb) rb.addEventListener('dblclick', (e) => ftOnRowDblClick(e, 'remote'));
  if (lb) lb.addEventListener('click', (e) => ftOnRowClick(e, 'local'));
  if (rb) rb.addEventListener('click', (e) => ftOnRowClick(e, 'remote'));
  if (lc) lc.addEventListener('click', (e) => ftOnCrumbClick(e, 'local'));
  if (rc) rc.addEventListener('click', (e) => ftOnCrumbClick(e, 'remote'));
  if (lb) lb.addEventListener('contextmenu', (e) => ftOnRowContext(e, 'local'));
  if (rb) rb.addEventListener('contextmenu', (e) => ftOnRowContext(e, 'remote'));
  const qb = document.getElementById('ftQueueBody');
  if (qb) qb.addEventListener('click', ftOnQueueClick);
  ftInitSplitter();
  if (typeof WS !== 'undefined') WS.on('transfer', ftOnTransferEvent);
}

// 中间分隔条拖拽：调整本地/远程两栏宽度（min 20%/max 80%），比例存 localStorage，双击复位 50/50
function ftInitSplitter() {
  const ws = document.querySelector('#page-filetransfer .ft-workspace');
  const sp = document.getElementById('ftSplitter');
  if (!ws || !sp) return;
  const KEY = 'ft.splitRatio';
  const clamp = (r) => Math.max(0.2, Math.min(0.8, r));
  const apply = (r) => ws.style.setProperty('--ft-left', (clamp(r) * 100).toFixed(2) + '%');
  const saved = parseFloat(localStorage.getItem(KEY));
  if (saved >= 0.2 && saved <= 0.8) apply(saved);

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = ws.getBoundingClientRect();
    if (rect.width > 0) apply((e.clientX - rect.left) / rect.width);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    sp.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const r = parseFloat(ws.style.getPropertyValue('--ft-left')) / 100;
    if (r >= 0.2 && r <= 0.8) localStorage.setItem(KEY, r.toFixed(4));
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  sp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    sp.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  sp.addEventListener('dblclick', () => { apply(0.5); localStorage.setItem(KEY, '0.5'); });
}

function ftOnRowDblClick(e, side) {
  const row = e.target.closest('.ft-row');
  if (!row) return;
  // 仅目录双击进入；文件不再双击直传，传输统一走右键菜单（FileZilla 式）
  if (row.dataset.dir !== '1') return;
  const name = row.dataset.name;
  if (side === 'local') ftEnterLocal(name); else ftEnterRemote(name);
}

// 单击高亮当前行（纯视觉，实际传输/改名/删除均走右键菜单）
function ftOnRowClick(e, side) {
  const row = e.target.closest('.ft-row');
  if (!row) return;
  ftSetSelection(side, row.dataset.name);
}

function ftSetSelection(side, name) {
  if (side === 'local') ftLocalSel = name; else ftRemoteSel = name;
  const body = document.getElementById(side === 'local' ? 'ftLocalBody' : 'ftRemoteBody');
  if (body) body.querySelectorAll('.ft-row').forEach(r => r.classList.toggle('is-selected', r.dataset.name === name));
}

function ftOnCrumbClick(e, side) {
  const seg = e.target.closest('.ft-crumb-seg');
  if (!seg) return;
  const p = seg.dataset.path;
  if (side === 'local') ftLoadLocal(p); else ftLoadRemote(p);
}

// ====================== 会话连接栏 ======================

function ftRenderServerOptions() {
  const sel = document.getElementById('ftServerSelect');
  if (!sel) return;
  const list = Array.isArray(servers) ? servers : [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="">（暂无服务器，请先在「部署面板 · 服务器管理」添加）</option>';
    sel.disabled = true;
    return;
  }
  const keep = ftSessionId ? (ftCurrentServer && ftCurrentServer.id) : sel.value;
  sel.innerHTML = list.map(s =>
    `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} · ${escapeHtml(s.username)}@${escapeHtml(s.host)}:${s.port || 22}</option>`
  ).join('');
  if (keep) sel.value = keep;
  sel.disabled = !!ftSessionId;
}

function ftOnServerChange() {
  const hint = document.getElementById('ftSessionHint');
  if (hint) hint.textContent = '';
}

function ftToggleConnect(event) {
  return ftSessionId ? ftDisconnect(event) : ftConnect(event);
}

async function ftConnect(event) {
  const sel = document.getElementById('ftServerSelect');
  const serverId = sel && sel.value;
  if (!serverId) { showToast('请先选择服务器'); return; }
  const server = (servers || []).find(s => s.id === serverId) || { id: serverId };
  const btn = event ? event.currentTarget : document.getElementById('ftConnectBtn');

  ftSetStatus('connecting', `连接中 · ${server.name || ''}`);
  ftRenderRemoteBody({ kind: 'loading', title: '正在连接服务器', desc: `${server.username || ''}@${server.host || ''}` });

  try {
    await withButtonBusy(btn, '连接中…', async () => {
      const res = await API.post('/api/sftp/connect', { serverId }, getConnTimeoutMs());
      ftSessionId = res.sessionId;
      ftCurrentServer = server;
    });
    ftStartKeepalive();
    ftSyncSessionUI();
    showToast('✅ 已连接', server.name || server.host);
    // 进入默认目录（服务器配置的「默认打开目录」，没有则后端按 home 解析）
    ftRemoteDefault = ftCurrentServer.defaultRemotePath || '.';
    ftLoadRemote(ftRemoteDefault);
  } catch (e) {
    ftSessionId = null;
    ftCurrentServer = null;
    ftSyncSessionUI();
    ftRenderRemoteBody({ kind: 'error', title: '连接失败', desc: e.message });
    showToast('❌ 连接失败', e.message);
  }
}

async function ftDisconnect(event) {
  const sid = ftSessionId;
  const btn = event ? event.currentTarget : document.getElementById('ftConnectBtn');
  ftStopKeepalive();
  try {
    await withButtonBusy(btn, '断开中…', async () => {
      if (sid) await API.post('/api/sftp/disconnect', { sessionId: sid });
    });
  } catch (e) {
    console.warn('[FileTransfer] 断开失败:', e.message);
  } finally {
    ftSessionId = null;
    ftCurrentServer = null;
    ftSyncSessionUI();
    showToast('已断开连接');
  }
}

// 会话失效（keepalive/列目录 410）：复位为未连接并提示重连
function ftHandleSessionLost() {
  ftStopKeepalive();
  ftSessionId = null;
  ftCurrentServer = null;
  ftSyncSessionUI();
  ftRenderRemoteBody({ kind: 'error', title: '连接已断开', desc: '会话失效，请重新连接。' });
  showToast('⚠️ SFTP 会话已断开', '请重新连接');
}

// 按会话态同步：连接按钮、下拉锁定、状态药丸、远程栏工具栏与（断开时）占位
function ftSyncSessionUI() {
  const btn = document.getElementById('ftConnectBtn');
  const sel = document.getElementById('ftServerSelect');
  const connected = !!ftSessionId;

  if (btn) {
    btn.textContent = connected ? '断开' : '连接';
    btn.classList.toggle('btn--primary', !connected);
    btn.classList.toggle('btn--danger', connected);
  }
  if (sel) sel.disabled = connected || !(Array.isArray(servers) && servers.length);
  ftUpdateRemoteToolbar();

  if (connected && ftCurrentServer) {
    ftSetStatus('connected', `已连接 · ${ftCurrentServer.username || ''}@${ftCurrentServer.host || ''}`);
  } else {
    ftSetStatus('idle', '未连接');
    ftRemotePath = '';
    ftSetCount('ftRemoteCount', null);
    const crumb = document.getElementById('ftRemoteCrumb');
    if (crumb) crumb.innerHTML = '';
    ftRenderRemoteBody({ kind: 'empty', icon: '🖥', title: '远程文件浏览', desc: '未连接，请选择服务器后点击「连接」。' });
  }
}

function ftSetStatus(kind, text) {
  const wrap = document.getElementById('ftSessionStatus');
  if (!wrap) return;
  wrap.classList.remove('is-connected', 'is-connecting');
  if (kind === 'connected') wrap.classList.add('is-connected');
  else if (kind === 'connecting') wrap.classList.add('is-connecting');
  const t = wrap.querySelector('.ft-status-text');
  if (t) t.textContent = text;
}

function ftStartKeepalive() {
  ftStopKeepalive();
  ftKeepaliveTimer = setInterval(ftDoKeepalive, FT_KEEPALIVE_MS);
}

function ftStopKeepalive() {
  if (ftKeepaliveTimer) { clearInterval(ftKeepaliveTimer); ftKeepaliveTimer = null; }
}

async function ftDoKeepalive() {
  if (!ftSessionId) { ftStopKeepalive(); return; }
  try {
    await API.post(`/api/sftp/${ftSessionId}/keepalive`);
  } catch (e) {
    ftHandleSessionLost();
  }
}

// ====================== 本地栏 ======================

async function ftLoadLocal(path) {
  ftRenderLoading('local');
  try {
    const data = await API.get('/api/fs/local/list?path=' + encodeURIComponent(path || ''));
    ftLocalPath = data.path;
    ftLocalParent = data.parent;
    if (data.home) ftLocalHomeDir = data.home;
    ftLocalSel = null;
    ftBuildCrumb('local', data.path);
    ftRenderList('local', data.items);
    ftSetCount('ftLocalCount', data.items.length);
    ftUpdateLocalToolbar();
  } catch (e) {
    ftSetCount('ftLocalCount', null);
    renderState(document.getElementById('ftLocalBody'), {
      kind: 'error', icon: '⚠️', title: '读取失败', desc: e.message,
      actionHTML: '<button class="btn btn--sm" onclick="ftLocalRefresh()">重试</button>',
    });
  }
}

function ftLocalUp() { if (ftLocalParent) ftLoadLocal(ftLocalParent); }
function ftLocalHome() { ftLoadLocal(ftLocalHomeDir || ''); }
function ftLocalRefresh() { ftLoadLocal(ftLocalPath || ''); }
function ftEnterLocal(name) { ftLoadLocal(ftJoin(ftLocalPath, name)); }

function ftUpdateLocalToolbar() {
  setDisabled('ftLocalUp', !ftLocalParent);
  setDisabled('ftLocalHome', !ftLocalHomeDir);
  setDisabled('ftLocalRefresh', false);
  setDisabled('ftLocalMkdir', !ftLocalPath);
  setDisabled('ftRefreshBtn', false); // 顶部「刷新」随本地就绪启用（刷新两栏）
}

// ====================== 远程栏 ======================

async function ftLoadRemote(path) {
  if (!ftSessionId) return;
  ftRenderLoading('remote');
  try {
    const data = await API.get(`/api/sftp/${ftSessionId}/list?path=` + encodeURIComponent(path || '.'));
    ftRemotePath = data.path;
    ftRemoteSel = null;
    ftBuildCrumb('remote', data.path);
    ftRenderList('remote', data.items);
    ftSetCount('ftRemoteCount', data.items.length);
    ftUpdateRemoteToolbar();
  } catch (e) {
    if (/会话/.test(e.message)) { ftHandleSessionLost(); return; }
    ftSetCount('ftRemoteCount', null);
    renderState(document.getElementById('ftRemoteBody'), {
      kind: 'error', icon: '⚠️', title: '读取失败', desc: e.message,
      actionHTML: '<button class="btn btn--sm" onclick="ftRemoteRefresh()">重试</button>',
    });
  }
}

function ftRemoteUp() {
  const p = ftPosixDirname(ftRemotePath);
  if (p && p !== ftRemotePath) ftLoadRemote(p);
}
function ftRemoteHome() { ftLoadRemote(ftRemoteDefault || '.'); }
function ftRemoteRefresh() { if (ftRemotePath) ftLoadRemote(ftRemotePath); }
function ftEnterRemote(name) { ftLoadRemote(ftPosixJoin(ftRemotePath, name)); }

function ftUpdateRemoteToolbar() {
  const connected = !!ftSessionId;
  const atRoot = !ftRemotePath || ftRemotePath === '/';
  setDisabled('ftRemoteUp', !connected || atRoot);
  setDisabled('ftRemoteHome', !connected);
  setDisabled('ftRemoteRefresh', !connected || !ftRemotePath);
  setDisabled('ftRemoteMkdir', !connected || !ftRemotePath);
}

// 顶部「刷新」：两栏一起刷
function ftRefreshAll() {
  ftLocalRefresh();
  if (ftSessionId) ftRemoteRefresh();
}

// ====================== 渲染 ======================

function ftRenderLoading(side) {
  renderState(document.getElementById(side === 'local' ? 'ftLocalBody' : 'ftRemoteBody'), { kind: 'loading', title: '加载中…' });
}

function ftRenderRemoteBody(opts) {
  renderState(document.getElementById('ftRemoteBody'), opts);
}

function ftRenderList(side, items) {
  const body = document.getElementById(side === 'local' ? 'ftLocalBody' : 'ftRemoteBody');
  if (!body) return;
  if (!items || items.length === 0) {
    renderState(body, { kind: 'empty', icon: '📂', title: '空目录', desc: '该目录下没有文件。', sm: true });
    return;
  }
  body.innerHTML = `<div class="ft-list">${items.map(ftRowHtml).join('')}</div>`;
}

function ftRowHtml(item) {
  const isDir = !!item.isDir;
  const icon = item.isSymlink ? '🔗' : (isDir ? '📁' : '📄');
  const size = isDir ? '' : ftFmtSize(item.size);
  const time = item.mtime ? ftFmtTime(item.mtime) : '';
  const cls = 'ft-row' + (isDir ? ' is-dir' : '') + (item.isSymlink ? ' is-link' : '');
  const linkTip = item.isSymlink && item.target ? ` <span class="ft-row-link">→ ${escapeHtml(item.target)}</span>` : '';
  return `<div class="${cls}" data-name="${escapeAttr(item.name)}" data-dir="${isDir ? '1' : '0'}" title="${escapeAttr(item.name)}">`
    + `<span class="ft-row-icon">${icon}</span>`
    + `<span class="ft-row-name">${escapeHtml(item.name)}${linkTip}</span>`
    + `<span class="ft-row-size">${size}</span>`
    + `<span class="ft-row-time">${time}</span>`
    + '</div>';
}

// 面包屑：把绝对路径切成可点的层级（POSIX/mac 本地均以 / 分隔）
function ftBuildCrumb(side, fullPath) {
  const el = document.getElementById(side === 'local' ? 'ftLocalCrumb' : 'ftRemoteCrumb');
  if (!el) return;
  const segs = ftPathSegments(fullPath);
  el.innerHTML = segs
    .map(s => `<span class="ft-crumb-seg" data-path="${escapeAttr(s.path)}" title="${escapeAttr(s.path)}">${escapeHtml(s.label)}</span>`)
    .join('<span class="ft-crumb-sep">/</span>');
}

function ftPathSegments(full) {
  if (!full || full === '/') return [{ label: '/', path: '/' }];
  const parts = full.split('/').filter(Boolean);
  const segs = [{ label: '/', path: '/' }];
  let acc = '';
  for (const p of parts) { acc += '/' + p; segs.push({ label: p, path: acc }); }
  return segs;
}

// ====================== 增删改（T6）+ 行右键菜单 ======================

// 新建文件夹：当前目录下，名称走系统弹窗
async function ftMkdir(side) {
  if (side === 'remote' && !ftSessionId) return;
  const dir = side === 'local' ? ftLocalPath : ftRemotePath;
  if (!dir) return;
  const name = await showPrompt('新建文件夹', { placeholder: '文件夹名称', confirmText: '新建' });
  if (!name || !name.trim()) return;
  const path = side === 'local' ? ftJoin(dir, name.trim()) : ftPosixJoin(dir, name.trim());
  try {
    if (side === 'local') await API.post('/api/fs/local/mkdir', { path });
    else await API.post(`/api/sftp/${ftSessionId}/mkdir`, { path });
    showToast('✅ 已新建文件夹', name.trim());
    ftRefreshSide(side);
  } catch (e) { ftOpError(side, e, '新建失败'); }
}
function ftLocalMkdir() { ftMkdir('local'); }
function ftRemoteMkdir() { ftMkdir('remote'); }

// 重命名：同目录内换名
async function ftRename(side, name) {
  const dir = side === 'local' ? ftLocalPath : ftRemotePath;
  const next = await showPrompt('重命名', { defaultValue: name, confirmText: '重命名' });
  if (!next || !next.trim() || next.trim() === name) return;
  const from = side === 'local' ? ftJoin(dir, name) : ftPosixJoin(dir, name);
  const to = side === 'local' ? ftJoin(dir, next.trim()) : ftPosixJoin(dir, next.trim());
  try {
    if (side === 'local') await API.post('/api/fs/local/rename', { from, to });
    else await API.post(`/api/sftp/${ftSessionId}/rename`, { from, to });
    showToast('✅ 已重命名', `${name} → ${next.trim()}`);
    ftRefreshSide(side);
  } catch (e) { ftOpError(side, e, '重命名失败'); }
}

// 删除：文件直接删；目录二次确认并递归删（含内容）
async function ftDelete(side, name, isDir) {
  const dir = side === 'local' ? ftLocalPath : ftRemotePath;
  const path = side === 'local' ? ftJoin(dir, name) : ftPosixJoin(dir, name);
  const msg = isDir
    ? `确定删除目录「${name}」及其全部内容？此操作不可恢复。`
    : `确定删除「${name}」？此操作不可恢复。`;
  const ok = await showConfirm(msg, { danger: true, confirmText: '删除' });
  if (!ok) return;
  try {
    const body = { path, recursive: !!isDir };
    if (side === 'local') await API.post('/api/fs/local/delete', body);
    else await API.post(`/api/sftp/${ftSessionId}/delete`, body);
    showToast('🗑 已删除', name);
    ftRefreshSide(side);
  } catch (e) { ftOpError(side, e, '删除失败'); }
}

function ftRefreshSide(side) { if (side === 'local') ftLocalRefresh(); else ftRemoteRefresh(); }

function ftOpError(side, e, title) {
  if (side === 'remote' && /会话/.test(e.message)) { ftHandleSessionLost(); return; }
  showToast('❌ ' + title, e.message);
}

// 行右键 → 上下文菜单（打开/重命名/删除）
function ftOnRowContext(e, side) {
  const row = e.target.closest('.ft-row');
  if (!row) return;
  if (side === 'remote' && !ftSessionId) return;
  e.preventDefault();
  const name = row.dataset.name;
  ftSetSelection(side, name); // 右键即高亮该行，明确操作目标
  const isDir = row.dataset.dir === '1';
  const items = [];
  if (isDir) items.push({ label: '打开', fn: () => (side === 'local' ? ftEnterLocal(name) : ftEnterRemote(name)) });
  if (side === 'local' && ftSessionId) items.push({ label: '上传到远程', fn: () => ftUpload(name) });
  if (side === 'remote') items.push({ label: '下载到本地', fn: () => ftDownload(name) });
  items.push({ label: '重命名', fn: () => ftRename(side, name) });
  items.push({ label: '删除', danger: true, fn: () => ftDelete(side, name, isDir) });
  ftShowContextMenu(e.clientX, e.clientY, items);
}

function ftShowContextMenu(x, y, items) {
  ftHideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ft-ctx-menu';
  menu.id = 'ftCtxMenu';
  menu.innerHTML = items.map((it, i) => `<button class="ft-ctx-item${it.danger ? ' is-danger' : ''}" data-i="${i}">${escapeHtml(it.label)}</button>`).join('');
  document.body.appendChild(menu);
  const w = menu.offsetWidth || 150;
  const h = menu.offsetHeight || (items.length * 34 + 8);
  menu.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('.ft-ctx-item');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    ftHideContextMenu();
    if (it && it.fn) it.fn();
  });
  document.addEventListener('mousedown', ftCtxDismiss, true);
  document.addEventListener('keydown', ftCtxEsc, true);
  window.addEventListener('blur', ftHideContextMenu);
}

function ftCtxDismiss(e) { if (!e.target.closest('#ftCtxMenu')) ftHideContextMenu(); }
function ftCtxEsc(e) { if (e.key === 'Escape') ftHideContextMenu(); }

function ftHideContextMenu() {
  const m = document.getElementById('ftCtxMenu');
  if (m) m.remove();
  document.removeEventListener('mousedown', ftCtxDismiss, true);
  document.removeEventListener('keydown', ftCtxEsc, true);
  window.removeEventListener('blur', ftHideContextMenu);
}

// ====================== 传输（T7）：上传/下载 + 队列进度 ======================

// 上传：本地 name（缺省取选中）→ 远程当前目录
function ftUpload(name) {
  if (!ftSessionId) { showToast('请先连接服务器'); return; }
  name = name || ftLocalSel;
  if (!name) { showToast('请先在本地栏选中要上传的项'); return; }
  ftStartTransfer('upload', [{ from: ftJoin(ftLocalPath, name), to: ftPosixJoin(ftRemotePath, name) }], name);
}

// 下载：远程 name（缺省取选中）→ 本地当前目录
function ftDownload(name) {
  if (!ftSessionId) return;
  name = name || ftRemoteSel;
  if (!name) { showToast('请先在远程栏选中要下载的项'); return; }
  ftStartTransfer('download', [{ from: ftPosixJoin(ftRemotePath, name), to: ftJoin(ftLocalPath, name) }], name);
}

async function ftStartTransfer(direction, items, label) {
  const onConflict = (document.getElementById('ftConflictPolicy') || {}).value || 'overwrite';
  try {
    const res = await API.post(`/api/sftp/${ftSessionId}/transfer`, { direction, items, onConflict });
    // 预登记任务（WS 进度随后填充）；已存在则不覆盖，避免与早到的事件抢
    if (!ftTasks.has(res.taskId)) {
      ftTasks.set(res.taskId, { taskId: res.taskId, direction, state: 'queued', filesTotal: 0, filesDone: 0, curName: label || '', curPercent: 0, speed: 0, etaSec: 0, startedAt: Date.now() });
    }
    ftRenderQueue();
    showToast(direction === 'upload' ? '⬆ 开始上传' : '⬇ 开始下载', label || `${items.length} 项`);
  } catch (e) { ftOpError('remote', e, '传输启动失败'); }
}

// WS 'transfer' 事件：驱动队列任务进度（事件形态见后端 transferQueue.emit）
function ftOnTransferEvent(d) {
  if (!d || !d.taskId) return;
  let t = ftTasks.get(d.taskId);
  if (!t) { t = { taskId: d.taskId, direction: d.direction, state: 'transferring', filesTotal: 0, filesDone: 0, curName: '', curPercent: 0, speed: 0, etaSec: 0, startedAt: Date.now() }; ftTasks.set(d.taskId, t); }
  if (typeof d.filesTotal === 'number' && d.filesTotal) t.filesTotal = d.filesTotal;
  if (typeof d.filesDone === 'number') t.filesDone = d.filesDone;
  switch (d.phase) {
    case 'started': t.state = 'transferring'; break;
    case 'progress': t.state = 'transferring'; t.curName = d.name || t.curName; t.curPercent = d.percent || 0; t.speed = d.speed || 0; t.etaSec = d.etaSec || 0; break;
    case 'file-done': case 'file-skipped': case 'file-failed': t.curName = d.name || t.curName; t.curPercent = 100; if (d.phase === 'file-failed') t.lastError = d.error; break;
    case 'done': t.state = 'done'; t.curPercent = 100; ftAfterTransferDone(t); break;
    case 'failed': t.state = 'failed'; t.error = d.error; ftAfterTransferDone(t); break;
    case 'cancelled': t.state = 'cancelled'; ftAfterTransferDone(t); break;
    default: break;
  }
  ftRenderQueue();
}

// 传输结束：刷新目标栏让结果出现 + 收尾提示
function ftAfterTransferDone(t) {
  if (t.direction === 'upload') { if (ftSessionId) ftRemoteRefresh(); } else ftLocalRefresh();
  const label = t.state === 'done' ? '✅ 传输完成' : (t.state === 'cancelled' ? '已取消传输' : '❌ 传输失败');
  showToast(label, t.error || t.curName || '');
}

function ftRenderQueue() {
  const body = document.getElementById('ftQueueBody');
  if (!body) return;
  const tasks = [...ftTasks.values()].sort((a, b) => b.startedAt - a.startedAt);
  const countEl = document.getElementById('ftQueueCount');
  if (countEl) countEl.textContent = String(tasks.length);
  const hasFinished = tasks.some(t => ['done', 'failed', 'cancelled'].includes(t.state));
  const hasActive = tasks.some(t => t.state === 'queued' || t.state === 'transferring');
  setDisabled('ftQueueClear', !hasFinished);
  setDisabled('ftQueueCancelAll', !hasActive);
  if (tasks.length === 0) {
    renderState(body, { kind: 'empty', icon: '📭', title: '暂无传输任务', desc: '右键文件 → 上传到远程 / 下载到本地，进度在此显示。', sm: true });
    return;
  }
  body.innerHTML = `<div class="ft-queue-list">${tasks.map(ftTaskRowHtml).join('')}</div>`;
}

function ftTaskRowHtml(t) {
  const active = t.state === 'queued' || t.state === 'transferring';
  const pct = t.filesTotal ? Math.min(100, Math.round(((t.filesDone + (t.curPercent || 0) / 100) / t.filesTotal) * 100)) : (t.state === 'done' ? 100 : 0);
  const icon = t.direction === 'upload' ? '⬆' : '⬇';
  const stateText = { queued: '排队', transferring: '传输中', done: '完成', failed: '失败', cancelled: '已取消' }[t.state] || t.state;
  const meta = active
    ? `${t.filesDone}/${t.filesTotal || '?'} · ${ftFmtSize(t.speed)}/s · 剩 ${ftFmtEta(t.etaSec)}`
    : `${t.filesDone}/${t.filesTotal || t.filesDone}`;
  const cls = 'ft-task' + (t.state === 'failed' ? ' is-failed' : '') + (t.state === 'done' ? ' is-done' : '');
  const btn = active
    ? `<button class="btn btn--sm btn--danger ft-task-act" data-act="cancel" data-task="${escapeAttr(t.taskId)}">取消</button>`
    : `<button class="btn btn--sm btn--icon ft-task-act" data-act="clear" data-task="${escapeAttr(t.taskId)}" title="移除">✕</button>`;
  return `<div class="${cls}">`
    + `<span class="ft-task-icon">${icon}</span>`
    + `<div class="ft-task-main"><div class="ft-task-name">${escapeHtml(t.curName || (t.direction === 'upload' ? '上传' : '下载'))}<span class="ft-task-state">${stateText}</span></div>`
    + `<div class="ft-task-bar"><div class="ft-task-fill" style="width:${pct}%"></div></div></div>`
    + `<span class="ft-task-meta">${meta}</span>`
    + btn
    + '</div>';
}

function ftOnQueueClick(e) {
  const b = e.target.closest('.ft-task-act');
  if (!b) return;
  const taskId = b.dataset.task;
  if (b.dataset.act === 'cancel') ftCancelTask(taskId);
  else { ftTasks.delete(taskId); ftRenderQueue(); }
}

async function ftCancelTask(taskId) {
  try { await API.post(`/api/sftp/transfer/${taskId}/cancel`); } catch (e) { /* 已结束/不存在，忽略 */ }
}

function ftClearFinished() {
  for (const [id, t] of ftTasks) if (['done', 'failed', 'cancelled'].includes(t.state)) ftTasks.delete(id);
  ftRenderQueue();
}

async function ftCancelAll() {
  for (const t of ftTasks.values()) {
    if (t.state === 'queued' || t.state === 'transferring') {
      try { await API.post(`/api/sftp/transfer/${t.taskId}/cancel`); } catch (e) { /* ignore */ }
    }
  }
}

// ====================== 工具 ======================

function setDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = !!disabled;
}

function ftSetCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = (n === null || n === undefined) ? '' : `${n} 项`;
}

// 本地路径拼接（mac 用 /，后端 path.resolve 兜底归一）
function ftJoin(dir, name) {
  if (!dir) return name;
  return (dir.endsWith('/') ? dir : dir + '/') + name;
}

function ftPosixJoin(dir, name) {
  if (!dir || dir === '/') return '/' + name;
  return (dir.endsWith('/') ? dir : dir + '/') + name;
}

function ftPosixDirname(p) {
  if (!p || p === '/') return '/';
  const trimmed = p.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  if (i <= 0) return '/';
  return trimmed.slice(0, i);
}

function ftFmtSize(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)) + ' ' + u[i];
}

function ftFmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ftFmtEta(sec) {
  if (!sec || sec < 0) return '0s';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}
