// ========== filetransfer.js — 文件传输页（FileZilla 式双栏 SFTP）==========
// T4：页面骨架 + 菜单 + 会话连接栏（驱动 /api/sftp 持久会话）。
// T5：双栏目录浏览 —— 本地 /api/fs/local/list、远程 /api/sftp/:sid/list；双击进目录、
//     上一级 / 主目录(默认目录) / 刷新 / 路径栏直达 / 列排序。新建/删除在 T6，上传下载在 T7。

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

// T8：列表缓存（点列头重排时复用，不重拉）+ 排序态（key: name|size|mtime，dir: 1 升/-1 降；localStorage 记忆）
let ftLocalItems = [];
let ftRemoteItems = [];
let ftLocalSort = ftLoadSort('ft.localSort');
let ftRemoteSort = ftLoadSort('ft.remoteSort');

// T9：路径栏自动补全（按 side 缓存「当前父目录的子目录列表」+ 当前联想结果/高亮项）
const ftSug = {
  local: { dir: null, items: [], list: [], active: -1, open: false },
  remote: { dir: null, items: [], list: [], active: -1, open: false },
};
let ftSugTimer = null;

let ftWired = false; // 事件委托只绑一次

// 进入页面：绑事件 + 刷新服务器下拉 + 同步会话态；本地栏首次自动列家目录
function initFileTransfer() {
  ftWireOnce();
  ftRenderServerOptions();
  ftRenderQueue();
  ftSyncSessionUI();
  ftUpdateListhead('local');
  ftUpdateListhead('remote');
  if (!ftLocalPath) ftLoadLocal('');
}

// 双击进目录 / 路径栏回车跳转 / 点列头排序：用事件委托，避免给每行内联 onclick（转义 + 重绑都麻烦）
function ftWireOnce() {
  if (ftWired) return;
  ftWired = true;
  const lb = document.getElementById('ftLocalBody');
  const rb = document.getElementById('ftRemoteBody');
  const lp = document.getElementById('ftLocalPathInput');
  const rp = document.getElementById('ftRemotePathInput');
  const ls = document.getElementById('ftLocalSuggest');
  const rs = document.getElementById('ftRemoteSuggest');
  const lh = document.getElementById('ftLocalListhead');
  const rh = document.getElementById('ftRemoteListhead');
  if (lb) lb.addEventListener('dblclick', (e) => ftOnRowDblClick(e, 'local'));
  if (rb) rb.addEventListener('dblclick', (e) => ftOnRowDblClick(e, 'remote'));
  if (lb) lb.addEventListener('click', (e) => ftOnRowClick(e, 'local'));
  if (rb) rb.addEventListener('click', (e) => ftOnRowClick(e, 'remote'));
  if (lp) {
    lp.addEventListener('keydown', (e) => ftOnPathKey(e, 'local'));
    lp.addEventListener('input', () => ftOnPathInput('local'));
    lp.addEventListener('blur', () => setTimeout(() => ftHideSuggest('local'), 120));
  }
  if (rp) {
    rp.addEventListener('keydown', (e) => ftOnPathKey(e, 'remote'));
    rp.addEventListener('input', () => ftOnPathInput('remote'));
    rp.addEventListener('blur', () => setTimeout(() => ftHideSuggest('remote'), 120));
  }
  // 联想下拉用 mousedown（早于 input 的 blur），点中即接受，避免被 blur 抢先收起
  if (ls) ls.addEventListener('mousedown', (e) => ftOnSuggestDown(e, 'local'));
  if (rs) rs.addEventListener('mousedown', (e) => ftOnSuggestDown(e, 'remote'));
  if (lh) lh.addEventListener('click', (e) => ftOnSortClick(e, 'local'));
  if (rh) rh.addEventListener('click', (e) => ftOnSortClick(e, 'remote'));
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

// 路径输入栏键盘：联想开时 ↑↓ 选择 / Enter 进入选中项 / Tab 补全 / Esc 关联想；
// 否则 Enter 直达输入路径、Esc 还原当前路径。
function ftOnPathKey(e, side) {
  const st = ftSug[side];
  if (e.key === 'ArrowDown') { if (st.open) { e.preventDefault(); ftMoveSuggest(side, 1); } return; }
  if (e.key === 'ArrowUp') { if (st.open) { e.preventDefault(); ftMoveSuggest(side, -1); } return; }
  if (e.key === 'Tab') {
    if (st.open && st.list.length) {
      e.preventDefault();
      const it = st.list[st.active >= 0 ? st.active : 0];
      const { dir } = ftSplitPath(e.target.value);
      e.target.value = (dir === '/' ? '/' : dir + '/') + it.name + '/';
      ftOnPathInput(side); // 补全后继续提示下一级
    }
    return;
  }
  if (e.key === 'Enter') {
    if (st.open && st.active >= 0) { e.preventDefault(); ftAcceptSuggest(side, st.active); return; }
    const v = e.target.value.trim();
    if (!v) return;
    ftHideSuggest(side);
    if (side === 'local') ftLoadLocal(v);
    else if (ftSessionId) ftLoadRemote(v);
    e.target.blur();
  } else if (e.key === 'Escape') {
    if (st.open) { ftHideSuggest(side); return; }
    e.target.value = e.target.dataset.current || '';
    e.target.blur();
  }
}

// 把当前路径回填进输入栏（dataset.current 记当前值，供 Esc 还原）
function ftSetPath(side, path) {
  const inp = document.getElementById(side === 'local' ? 'ftLocalPathInput' : 'ftRemotePathInput');
  if (inp) { inp.value = path || ''; inp.dataset.current = path || ''; }
}

// ---------- 路径自动补全（T9）：输入时提示当前父目录下匹配前缀的子目录 ----------

// 把输入值切成「父目录 + 待匹配前缀」：'/a/b/pro' → { dir:'/a/b', prefix:'pro' }
function ftSplitPath(value) {
  const v = value || '';
  const i = v.lastIndexOf('/');
  if (i < 0) return { dir: '', prefix: v };
  return { dir: v.slice(0, i) || '/', prefix: v.slice(i + 1) };
}

// 输入事件：防抖后拉取/过滤联想（远程未连接不提示）
function ftOnPathInput(side) {
  clearTimeout(ftSugTimer);
  ftSugTimer = setTimeout(() => ftUpdateSuggest(side), 150);
}

async function ftUpdateSuggest(side) {
  const inp = document.getElementById(side === 'local' ? 'ftLocalPathInput' : 'ftRemotePathInput');
  if (!inp) return;
  if (side === 'remote' && !ftSessionId) { ftHideSuggest(side); return; }
  const { dir } = ftSplitPath(inp.value);
  const st = ftSug[side];
  // 父目录变了才重新拉列表（同目录内继续打字纯本地过滤，不重复请求）
  if (st.dir !== dir) {
    try {
      const data = side === 'local'
        ? await API.get('/api/fs/local/list?path=' + encodeURIComponent(dir))
        : await API.get(`/api/sftp/${ftSessionId}/list?path=` + encodeURIComponent(dir));
      st.dir = dir;
      st.items = (data.items || []).filter((it) => it.isDir);
    } catch (e) {
      st.dir = dir; st.items = [];
    }
  }
  // await 期间用户可能又改了输入：用最新值重新切分，目录不一致就交给下一次输入处理
  const cur = ftSplitPath(inp.value);
  if (cur.dir !== st.dir) return;
  const pfx = cur.prefix.toLowerCase();
  st.list = st.items.filter((it) => it.name.toLowerCase().startsWith(pfx)).slice(0, 50);
  st.active = -1;
  if (!st.list.length) { ftHideSuggest(side); return; }
  ftRenderSuggest(side);
}

function ftRenderSuggest(side) {
  const st = ftSug[side];
  const box = document.getElementById(side === 'local' ? 'ftLocalSuggest' : 'ftRemoteSuggest');
  if (!box) return;
  box.innerHTML = st.list.map((it, i) =>
    `<div class="ft-suggest-item${i === st.active ? ' is-active' : ''}" data-i="${i}">`
    + `<span class="ft-suggest-ico">📁</span><span class="ft-suggest-name">${escapeHtml(it.name)}</span></div>`
  ).join('');
  box.hidden = false;
  st.open = true;
}

function ftHideSuggest(side) {
  const st = ftSug[side];
  st.open = false; st.active = -1; st.list = [];
  const box = document.getElementById(side === 'local' ? 'ftLocalSuggest' : 'ftRemoteSuggest');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

function ftMoveSuggest(side, delta) {
  const st = ftSug[side];
  if (!st.open || !st.list.length) return;
  st.active = (st.active + delta + st.list.length) % st.list.length;
  ftRenderSuggest(side);
  const box = document.getElementById(side === 'local' ? 'ftLocalSuggest' : 'ftRemoteSuggest');
  const el = box && box.querySelector('.is-active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// 接受某条联想：拼出完整目录并进入
function ftAcceptSuggest(side, idx) {
  const st = ftSug[side];
  const it = st.list[idx];
  if (!it) return;
  const inp = document.getElementById(side === 'local' ? 'ftLocalPathInput' : 'ftRemotePathInput');
  const { dir } = ftSplitPath(inp ? inp.value : '');
  const full = dir === '/' ? '/' + it.name : dir + '/' + it.name;
  ftHideSuggest(side);
  if (side === 'local') ftLoadLocal(full); else if (ftSessionId) ftLoadRemote(full);
}

function ftOnSuggestDown(e, side) {
  const item = e.target.closest('.ft-suggest-item');
  if (!item) return;
  e.preventDefault(); // 阻止输入框失焦，保证点选先于 blur 收起
  ftAcceptSuggest(side, Number(item.dataset.i));
}

// 点列头排序：同列切升/降，换列默认升序；目录恒置顶（见 ftSortItems）
function ftOnSortClick(e, side) {
  const col = e.target.closest('.ft-lh-col');
  if (!col) return;
  const sort = side === 'local' ? ftLocalSort : ftRemoteSort;
  const key = col.dataset.sort;
  if (sort.key === key) sort.dir = -sort.dir; else { sort.key = key; sort.dir = 1; }
  ftSaveSort(side);
  ftRenderList(side);
}

// 排序：目录恒在文件之前（FileZilla 默认分组），组内按所选列升/降
function ftSortItems(items, sort) {
  const dir = sort.dir < 0 ? -1 : 1;
  return items.slice().sort((a, b) => {
    if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1;
    let r;
    if (sort.key === 'size') r = (a.size || 0) - (b.size || 0);
    else if (sort.key === 'mtime') r = (a.mtime || 0) - (b.mtime || 0);
    else r = String(a.name).localeCompare(String(b.name), 'zh', { numeric: true, sensitivity: 'base' });
    return r * dir;
  });
}

// 列头高亮 + 升降箭头
function ftUpdateListhead(side) {
  const head = document.getElementById(side === 'local' ? 'ftLocalListhead' : 'ftRemoteListhead');
  if (!head) return;
  const sort = side === 'local' ? ftLocalSort : ftRemoteSort;
  head.querySelectorAll('.ft-lh-col').forEach((c) => {
    const active = c.dataset.sort === sort.key;
    c.classList.toggle('is-active', active);
    const arr = c.querySelector('.ft-lh-arr');
    if (arr) arr.textContent = active ? (sort.dir < 0 ? '▼' : '▲') : '';
  });
}

function ftLoadSort(key) {
  try { const s = JSON.parse(localStorage.getItem(key)); if (s && s.key) return { key: s.key, dir: s.dir < 0 ? -1 : 1 }; } catch (e) { /* ignore */ }
  return { key: 'name', dir: 1 };
}

function ftSaveSort(side) {
  const sort = side === 'local' ? ftLocalSort : ftRemoteSort;
  try { localStorage.setItem(side === 'local' ? 'ft.localSort' : 'ft.remoteSort', JSON.stringify(sort)); } catch (e) { /* ignore */ }
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
    ftRemoteItems = [];
    ftSetCount('ftRemoteCount', null);
    ftSetPath('remote', '');
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
    ftSetPath('local', data.path);
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
    ftSetPath('remote', data.path);
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
  // items 传入则缓存（供点列头重排复用）；不传则按当前缓存+排序态重渲染
  if (items) { if (side === 'local') ftLocalItems = items; else ftRemoteItems = items; }
  const list = side === 'local' ? ftLocalItems : ftRemoteItems;
  const sort = side === 'local' ? ftLocalSort : ftRemoteSort;
  ftUpdateListhead(side);
  if (!list || list.length === 0) {
    renderState(body, { kind: 'empty', icon: '📂', title: '空目录', desc: '该目录下没有文件。', sm: true });
    return;
  }
  body.innerHTML = `<div class="ft-list">${ftSortItems(list, sort).map(ftRowHtml).join('')}</div>`;
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
