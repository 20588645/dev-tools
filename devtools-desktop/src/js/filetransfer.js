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

let ftWired = false; // 事件委托只绑一次

// 进入页面：绑事件 + 刷新服务器下拉 + 同步会话态；本地栏首次自动列家目录
function initFileTransfer() {
  ftWireOnce();
  ftRenderServerOptions();
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
  if (lc) lc.addEventListener('click', (e) => ftOnCrumbClick(e, 'local'));
  if (rc) rc.addEventListener('click', (e) => ftOnCrumbClick(e, 'remote'));
  if (lb) lb.addEventListener('contextmenu', (e) => ftOnRowContext(e, 'local'));
  if (rb) rb.addEventListener('contextmenu', (e) => ftOnRowContext(e, 'remote'));
}

function ftOnRowDblClick(e, side) {
  const row = e.target.closest('.ft-row');
  if (!row || row.dataset.dir !== '1') return; // 只进目录
  const name = row.dataset.name;
  if (side === 'local') ftEnterLocal(name); else ftEnterRemote(name);
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
  const isDir = row.dataset.dir === '1';
  const items = [];
  if (isDir) items.push({ label: '打开', fn: () => (side === 'local' ? ftEnterLocal(name) : ftEnterRemote(name)) });
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
