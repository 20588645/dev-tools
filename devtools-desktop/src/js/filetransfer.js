// ========== filetransfer.js — 文件传输页（FileZilla 式双栏 SFTP）==========
// T4：页面骨架 + 菜单 + 会话连接栏（驱动 /api/sftp 持久会话）。
// T5：双栏目录浏览 —— 本地 /api/fs/local/list、远程 /api/sftp/:sid/list；双击进目录、
//     上一级 / 主目录(默认目录) / 刷新 / 路径栏直达 / 列排序。新建/删除在 T6，上传下载在 T7。

// 会话（T11 多服务器标签）：下面 ftSessionId/ftCurrentServer/ftRemote* 是「当前活动标签」的镜像——
// 切标签时先把镜像存回 ftTabs[当前]，再把目标标签装载进镜像；原有远程代码无感知地照常操作镜像即可。
let ftSessionId = null;
let ftCurrentServer = null;
const FT_KEEPALIVE_MS = 60 * 1000; // 1min 心跳，远低于后端 5min 空闲回收

// T11：标签列表 —— 每个标签 = 一个已连 SFTP 会话 + 各自远程态（路径/列表/选中/排序/补全缓存/独立心跳）。本地栏共享。
let ftTabs = [];
let ftActiveTabId = null;
let ftTabSeq = 0;

// 当前目录态
let ftLocalPath = '';
let ftLocalParent = null;
let ftLocalHomeDir = '';
let ftRemotePath = '';
let ftRemoteDefault = '.';

// 传输（T7）：选中集 + 任务表（taskId -> 进度态）
// T10：单选改多选 —— ftLocalSel/ftRemoteSel 为 Set<name>；anchor 供 Shift 范围选（鼠标多选用）
let ftLocalSel = new Set();
let ftRemoteSel = new Set();
const ftSelAnchor = { local: null, remote: null };
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

/**
 * 本页自管的服务器列表。
 *
 * 原先读 `app.js` 的全局 `servers`（由 `deploy.js` 的 `loadServers` /
 * Vue 服务器子页的 `syncLegacyServers` 回写）。Phase 6-2 弹窗迁完后那两条
 * 写入路径都删了，全局恒为空——下拉框永远「暂无服务器」。改为进入本页时
 * 自行拉 `/api/servers`；迁入 Vue 后本函数随整页一并删除。
 */
let ftServers = [];

async function ftLoadServers() {
  try {
    const data = await API.get('/api/servers');
    ftServers = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('加载服务器列表失败:', e);
    ftServers = [];
    if (typeof showToast === 'function') {
      showToast('加载服务器列表失败', (e && e.message) || '稍后重试');
    }
  }
  ftRenderServerOptions();
  ftSyncSessionUI();
}

// 进入页面：绑事件 + 刷新服务器下拉 + 同步会话态；本地栏首次自动列家目录
function initFileTransfer() {
  ftWireOnce();
  void ftLoadServers();
  ftRenderQueue();
  ftRenderTabs();
  ftSyncSessionUI();
  ftUpdateListhead('local');
  ftUpdateListhead('remote');
  ftUpdateStatusBar('local');
  ftUpdateStatusBar('remote');
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
  const tabs = document.getElementById('ftRemoteTabs');
  if (tabs) tabs.addEventListener('click', ftOnTabsClick);
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

function ftSelSet(side) { return side === 'local' ? ftLocalSel : ftRemoteSel; }
function ftSelNames(side) { return [...ftSelSet(side)]; }

// 单击：普通=单选；Ctrl/Cmd=切换；Shift=从锚点范围选；点空白=清选
function ftOnRowClick(e, side) {
  const row = e.target.closest('.ft-row');
  const set = ftSelSet(side);
  if (!row) { if (set.size) { set.clear(); ftApplySelectionUI(side); ftUpdateStatusBar(side); } return; }
  const name = row.dataset.name;
  if (e.shiftKey && ftSelAnchor[side]) {
    ftSelectRange(side, ftSelAnchor[side], name);
  } else if (e.metaKey || e.ctrlKey) {
    if (set.has(name)) set.delete(name); else set.add(name);
    ftSelAnchor[side] = name;
  } else {
    set.clear(); set.add(name); ftSelAnchor[side] = name;
  }
  ftApplySelectionUI(side);
  ftUpdateStatusBar(side);
}

// 设为单选（右键命中未选项 / 程序化选中用）
function ftSetSelection(side, name) {
  const set = ftSelSet(side);
  set.clear();
  if (name) set.add(name);
  ftSelAnchor[side] = name || null;
  ftApplySelectionUI(side);
  ftUpdateStatusBar(side);
}

// 按当前显示顺序选 from..to 区间（含两端）
function ftSelectRange(side, fromName, toName) {
  const body = document.getElementById(side === 'local' ? 'ftLocalBody' : 'ftRemoteBody');
  if (!body) return;
  const names = [...body.querySelectorAll('.ft-row')].map((r) => r.dataset.name);
  let i = names.indexOf(fromName); let j = names.indexOf(toName);
  const set = ftSelSet(side);
  if (i < 0 || j < 0) { set.clear(); set.add(toName); return; }
  if (i > j) { const t = i; i = j; j = t; }
  set.clear();
  for (let k = i; k <= j; k++) set.add(names[k]);
}

function ftApplySelectionUI(side) {
  const body = document.getElementById(side === 'local' ? 'ftLocalBody' : 'ftRemoteBody');
  const set = ftSelSet(side);
  if (body) body.querySelectorAll('.ft-row').forEach((r) => r.classList.toggle('is-selected', set.has(r.dataset.name)));
}

// 底部状态栏：默认「共 N 项 · 总大小」；有选中时「已选 M 项 · 大小 / 共 N 项」
function ftUpdateStatusBar(side) {
  const foot = document.getElementById(side === 'local' ? 'ftLocalFoot' : 'ftRemoteFoot');
  if (!foot) return;
  const items = side === 'local' ? ftLocalItems : ftRemoteItems;
  const set = ftSelSet(side);
  if (set.size) {
    let selSize = 0;
    items.forEach((it) => { if (set.has(it.name) && !it.isDir) selSize += (it.size || 0); });
    foot.textContent = `已选 ${set.size} 项 · ${ftFmtSize(selSize)}　/　共 ${items.length} 项`;
  } else {
    const total = items.reduce((s, it) => s + (it.isDir ? 0 : (it.size || 0)), 0);
    foot.textContent = items.length ? `共 ${items.length} 项 · ${ftFmtSize(total)}` : '';
  }
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
  const list = Array.isArray(ftServers) ? ftServers : [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="">（暂无服务器，请先在「部署面板 · 服务器管理」添加）</option>';
    sel.disabled = true;
    return;
  }
  const keep = sel.value;
  sel.innerHTML = list.map(s =>
    `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} · ${escapeHtml(s.username)}@${escapeHtml(s.host)}:${s.port || 22}</option>`
  ).join('');
  if (keep) sel.value = keep;
  sel.disabled = false; // T11：连接后仍可选下一个服务器再连，开新标签
}

function ftOnServerChange() {
  const hint = document.getElementById('ftSessionHint');
  if (hint) hint.textContent = '';
}

// ---- T11 标签：数据模型 + 活动标签镜像 save/restore ----
function ftMakeTab(sessionId, server) {
  return {
    id: ++ftTabSeq,
    sessionId,
    server,
    path: '',
    items: [],
    sel: new Set(),
    anchor: null,
    sort: ftLoadSort('ft.remoteSort'),
    sug: { dir: null, items: [], list: [], active: -1, open: false },
    defaultPath: (server && server.defaultRemotePath) || '.',
    keepaliveTimer: null,
  };
}

function ftActiveTabObj() { return ftTabs.find((t) => t.id === ftActiveTabId) || null; }

// 把镜像（当前活动标签的远程视图）存回标签对象
function ftSaveActiveTab() {
  const t = ftActiveTabObj();
  if (!t) return;
  t.sessionId = ftSessionId;
  t.server = ftCurrentServer;
  t.path = ftRemotePath;
  t.items = ftRemoteItems;
  t.sel = ftRemoteSel;
  t.anchor = ftSelAnchor.remote;
  t.sort = ftRemoteSort;
  t.defaultPath = ftRemoteDefault;
  t.sug = ftSug.remote;
}

// 把标签对象装载进镜像（之后远程代码照常操作镜像即可）
function ftLoadTabIntoView(t) {
  ftSessionId = t.sessionId;
  ftCurrentServer = t.server;
  ftRemotePath = t.path;
  ftRemoteItems = t.items;
  ftRemoteSel = t.sel;
  ftSelAnchor.remote = t.anchor;
  ftRemoteSort = t.sort;
  ftRemoteDefault = t.defaultPath;
  ftSug.remote = t.sug;
}

// 按当前镜像把远程栏 DOM 重渲染（切标签/关标签后用）
function ftRenderActiveRemote() {
  ftSyncSessionUI(); // 无会话时由它渲染未连接空态
  if (!ftSessionId) return;
  ftSetPath('remote', ftRemotePath);
  ftSetCount('ftRemoteCount', ftRemoteItems ? ftRemoteItems.length : 0);
  ftRenderList('remote', ftRemoteItems || []);
  ftUpdateStatusBar('remote');
  ftUpdateRemoteToolbar();
}

function ftSwitchTab(id) {
  if (id === ftActiveTabId) return;
  const t = ftTabs.find((x) => x.id === id);
  if (!t) return;
  ftHideSuggest('remote');
  ftSaveActiveTab();
  ftActiveTabId = id;
  ftLoadTabIntoView(t);
  ftRenderTabs();
  ftRenderActiveRemote();
}

// 关闭标签 = 断开该会话；活动标签关掉后切相邻标签，没了回未连接空态
async function ftCloseTab(id) {
  const t = ftTabs.find((x) => x.id === id);
  if (!t) return;
  ftStopKeepaliveFor(t);
  if (t.sessionId) API.post('/api/sftp/disconnect', { sessionId: t.sessionId }).catch(() => {});
  const wasActive = (id === ftActiveTabId);
  ftTabs = ftTabs.filter((x) => x.id !== id);
  showToast('已断开连接', (t.server && (t.server.name || t.server.host)) || '');
  ftActivateFallback(wasActive);
}

function ftRenderTabs() {
  const box = document.getElementById('ftRemoteTabs');
  if (!box) return;
  if (!ftTabs.length) { box.innerHTML = ''; box.classList.remove('has-tabs'); return; }
  box.classList.add('has-tabs');
  box.innerHTML = ftTabs.map((t) => {
    const active = t.id === ftActiveTabId;
    const name = (t.server && (t.server.name || t.server.host)) || '连接';
    const host = (t.server && t.server.host) || '';
    return `<div class="ft-tab${active ? ' is-active' : ''}" data-id="${t.id}" title="${escapeAttr(name + (host ? ' · ' + host : ''))}">`
      + `<span class="ft-tab-name">${escapeHtml(name)}</span>`
      + `<span class="ft-tab-close" data-close="${t.id}" title="断开此连接">×</span>`
      + '</div>';
  }).join('');
}

function ftOnTabsClick(e) {
  const close = e.target.closest('[data-close]');
  if (close) { e.stopPropagation(); ftCloseTab(Number(close.dataset.close)); return; }
  const tab = e.target.closest('.ft-tab');
  if (tab) ftSwitchTab(Number(tab.dataset.id));
}

// 连接：开一个新标签（已连同一服务器则切过去）。本地栏共享、不随标签变。
async function ftConnect(event) {
  const sel = document.getElementById('ftServerSelect');
  const serverId = sel && sel.value;
  if (!serverId) { showToast('请先选择服务器'); return; }
  const server = (ftServers || []).find((s) => s.id === serverId) || { id: serverId };
  const exist = ftTabs.find((t) => t.server && t.server.id === serverId);
  if (exist) { ftSwitchTab(exist.id); showToast('已切到该连接', server.name || server.host || ''); return; }
  const btn = event ? event.currentTarget : document.getElementById('ftConnectBtn');
  const hadActive = !!ftActiveTabObj();

  ftSetStatus('connecting', `连接中 · ${server.name || ''}`);
  if (!hadActive) ftRenderRemoteBody({ kind: 'loading', title: '正在连接服务器', desc: `${server.username || ''}@${server.host || ''}` });

  try {
    let sessionId;
    await withButtonBusy(btn, '连接中…', async () => {
      const res = await API.post('/api/sftp/connect', { serverId }, getConnTimeoutMs());
      sessionId = res.sessionId;
    });
    ftSaveActiveTab(); // 先存住旧活动标签，再切到新标签
    const tab = ftMakeTab(sessionId, server);
    ftTabs.push(tab);
    ftActiveTabId = tab.id;
    ftLoadTabIntoView(tab);
    ftStartKeepaliveFor(tab);
    ftRenderTabs();
    ftSyncSessionUI();
    showToast('✅ 已连接', server.name || server.host);
    ftRemoteDefault = tab.defaultPath; // 默认目录：服务器配置，没有则后端按 home 解析
    ftLoadRemote(ftRemoteDefault);
  } catch (e) {
    if (hadActive) { ftRenderActiveRemote(); } // 失败不开标签，恢复原活动视图
    else { ftSyncSessionUI(); ftRenderRemoteBody({ kind: 'error', title: '连接失败', desc: e.message }); }
    showToast('❌ 连接失败', e.message);
  }
}

// 会话失效（keepalive/列目录 410）：关掉对应标签并提示
function ftHandleTabSessionLost(t) {
  if (!t) return;
  ftStopKeepaliveFor(t);
  const wasActive = (t.id === ftActiveTabId);
  ftTabs = ftTabs.filter((x) => x.id !== t.id);
  showToast('⚠️ SFTP 会话已断开', (t.server && (t.server.name || t.server.host)) || '请重新连接');
  ftActivateFallback(wasActive);
}

// 兼容旧调用点（ftLoadRemote 列目录遇“会话”失效）：作用于当前活动标签
function ftHandleSessionLost() { ftHandleTabSessionLost(ftActiveTabObj()); }

// 移除活动标签后：切到相邻标签，没了则回未连接空态
function ftActivateFallback(wasActive) {
  if (!wasActive) { ftRenderTabs(); return; }
  if (ftTabs.length) {
    const next = ftTabs[ftTabs.length - 1];
    ftActiveTabId = next.id;
    ftLoadTabIntoView(next);
    ftRenderTabs();
    ftRenderActiveRemote();
  } else {
    ftActiveTabId = null;
    ftSessionId = null;
    ftCurrentServer = null;
    ftRenderTabs();
    ftSyncSessionUI();
  }
}

// 按会话态同步：连接按钮、下拉锁定、状态药丸、远程栏工具栏与（断开时）占位
function ftSyncSessionUI() {
  const btn = document.getElementById('ftConnectBtn');
  const sel = document.getElementById('ftServerSelect');
  const connected = !!ftSessionId;

  if (btn) { // T11：按钮恒为「连接」（开新标签），断开走标签上的 ×
    btn.textContent = '连接';
    btn.classList.add('btn--primary');
    btn.classList.remove('btn--danger');
  }
  if (sel) sel.disabled = !(Array.isArray(ftServers) && ftServers.length);
  ftUpdateRemoteToolbar();

  if (connected && ftCurrentServer) {
    ftSetStatus('connected', `已连接 · ${ftCurrentServer.username || ''}@${ftCurrentServer.host || ''}`);
  } else {
    ftSetStatus('idle', '未连接');
    ftRemotePath = '';
    ftRemoteItems = [];
    ftRemoteSel.clear(); ftSelAnchor.remote = null;
    ftSetCount('ftRemoteCount', null);
    ftSetPath('remote', '');
    ftUpdateStatusBar('remote');
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

// T11：每标签独立心跳（保活各自的 SFTP 会话，即使不是当前标签）
function ftStartKeepaliveFor(t) {
  ftStopKeepaliveFor(t);
  t.keepaliveTimer = setInterval(() => ftDoKeepaliveFor(t), FT_KEEPALIVE_MS);
}

function ftStopKeepaliveFor(t) {
  if (t && t.keepaliveTimer) { clearInterval(t.keepaliveTimer); t.keepaliveTimer = null; }
}

async function ftDoKeepaliveFor(t) {
  if (!t.sessionId) { ftStopKeepaliveFor(t); return; }
  try {
    await API.post(`/api/sftp/${t.sessionId}/keepalive`);
  } catch (e) {
    ftHandleTabSessionLost(t);
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
    ftLocalSel.clear(); ftSelAnchor.local = null;
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
    ftRemoteSel.clear(); ftSelAnchor.remote = null;
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
    ftUpdateStatusBar(side);
    return;
  }
  body.innerHTML = `<div class="ft-list">${ftSortItems(list, sort).map((it) => ftRowHtml(it, side)).join('')}</div>`;
  ftUpdateStatusBar(side);
}

function ftRowHtml(item, side) {
  const isDir = !!item.isDir;
  const icon = item.isSymlink ? '🔗' : (isDir ? '📁' : '📄');
  const size = isDir ? '' : ftFmtSize(item.size);
  const time = item.mtime ? ftFmtTime(item.mtime) : '';
  const sel = ftSelSet(side).has(item.name) ? ' is-selected' : '';
  const cls = 'ft-row' + (isDir ? ' is-dir' : '') + (item.isSymlink ? ' is-link' : '') + sel;
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

// 删除：支持批量；目录递归删（含内容）。names 为名称数组或单个名称
async function ftDelete(side, names) {
  const list = Array.isArray(names) ? names : (names ? [names] : []);
  if (!list.length) return;
  const dir = side === 'local' ? ftLocalPath : ftRemotePath;
  const items = side === 'local' ? ftLocalItems : ftRemoteItems;
  const byName = new Map(items.map((it) => [it.name, it]));
  const msg = list.length === 1
    ? ((byName.get(list[0]) || {}).isDir
      ? `确定删除目录「${list[0]}」及其全部内容？此操作不可恢复。`
      : `确定删除「${list[0]}」？此操作不可恢复。`)
    : `确定删除选中的 ${list.length} 项？其中的目录会连同内容一并删除，此操作不可恢复。`;
  const ok = await showConfirm(msg, { danger: true, confirmText: '删除' });
  if (!ok) return;
  let fail = 0;
  for (const n of list) {
    const isDir = !!(byName.get(n) || {}).isDir;
    const path = side === 'local' ? ftJoin(dir, n) : ftPosixJoin(dir, n);
    try {
      if (side === 'local') await API.post('/api/fs/local/delete', { path, recursive: isDir });
      else await API.post(`/api/sftp/${ftSessionId}/delete`, { path, recursive: isDir });
    } catch (e) {
      fail++;
      if (side === 'remote' && /会话/.test(e.message)) { ftHandleSessionLost(); return; }
    }
  }
  ftSelSet(side).clear();
  if (fail) showToast(`❌ 部分删除失败（${fail}/${list.length}）`);
  else showToast('🗑 已删除', list.length === 1 ? list[0] : `${list.length} 项`);
  ftRefreshSide(side);
}

function ftRefreshSide(side) { if (side === 'local') ftLocalRefresh(); else ftRemoteRefresh(); }

function ftOpError(side, e, title) {
  if (side === 'remote' && /会话/.test(e.message)) { ftHandleSessionLost(); return; }
  showToast('❌ ' + title, e.message);
}

// 行右键 → 上下文菜单（多选时批量）。右键命中未选中的行→改为只选它；命中已选→保持多选
function ftOnRowContext(e, side) {
  const row = e.target.closest('.ft-row');
  if (!row) return;
  if (side === 'remote' && !ftSessionId) return;
  e.preventDefault();
  const name = row.dataset.name;
  if (!ftSelSet(side).has(name)) ftSetSelection(side, name); // 右键即高亮该行，明确操作目标
  const names = ftSelNames(side);
  const n = names.length;
  const multi = n > 1;
  const isDir = row.dataset.dir === '1';
  const items = [];
  if (!multi && isDir) items.push({ label: '打开', fn: () => (side === 'local' ? ftEnterLocal(name) : ftEnterRemote(name)) });
  if (side === 'local' && ftSessionId) items.push({ label: multi ? `上传到远程（${n}）` : '上传到远程', fn: () => ftUpload(names) });
  if (side === 'remote') items.push({ label: multi ? `下载到本地（${n}）` : '下载到本地', fn: () => ftDownload(names) });
  if (!multi) items.push({ label: '重命名', fn: () => ftRename(side, name) });
  items.push({ label: multi ? `删除（${n}）` : '删除', danger: true, fn: () => ftDelete(side, names) });
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

// 上传：names 名称数组（或单个/缺省取本地选中）→ 远程当前目录
function ftUpload(names) {
  if (!ftSessionId) { showToast('请先连接服务器'); return; }
  const list = Array.isArray(names) ? names : (names ? [names] : ftSelNames('local'));
  if (!list.length) { showToast('请先在本地栏选中要上传的项'); return; }
  const items = list.map((n) => ({ from: ftJoin(ftLocalPath, n), to: ftPosixJoin(ftRemotePath, n) }));
  ftStartTransfer('upload', items, list.length === 1 ? list[0] : `${list.length} 项`);
}

// 下载：names 名称数组（或单个/缺省取远程选中）→ 本地当前目录
function ftDownload(names) {
  if (!ftSessionId) return;
  const list = Array.isArray(names) ? names : (names ? [names] : ftSelNames('remote'));
  if (!list.length) { showToast('请先在远程栏选中要下载的项'); return; }
  const items = list.map((n) => ({ from: ftPosixJoin(ftRemotePath, n), to: ftJoin(ftLocalPath, n) }));
  ftStartTransfer('download', items, list.length === 1 ? list[0] : `${list.length} 项`);
}

async function ftStartTransfer(direction, items, label) {
  const onConflict = (document.getElementById('ftConflictPolicy') || {}).value || 'overwrite';
  const sid = ftSessionId; // 绑定发起时的标签会话：跨标签传输各归各，结束只刷对应标签
  const srvName = ftCurrentServer && (ftCurrentServer.name || ftCurrentServer.host);
  try {
    const res = await API.post(`/api/sftp/${sid}/transfer`, { direction, items, onConflict });
    // 预登记任务（WS 进度随后填充）。若 WS 事件已抢先建好任务，必须补登 sessionId，
    // 否则结束时判不出归属（t.sessionId 为空）→ 当前标签不会自动刷新出现新文件。
    const exist = ftTasks.get(res.taskId);
    if (exist) { exist.sessionId = sid; exist.serverName = srvName; }
    else { ftTasks.set(res.taskId, { taskId: res.taskId, direction, sessionId: sid, serverName: srvName, state: 'queued', filesTotal: 0, filesDone: 0, curName: label || '', curPercent: 0, speed: 0, etaSec: 0, startedAt: Date.now() }); }
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

// 传输结束：刷新目标栏让结果出现 + 收尾提示 + 系统通知
function ftAfterTransferDone(t) {
  // 上传只刷「发起该传输的那个标签」当前是活动标签时的远程栏；下载刷共享本地栏
  if (t.direction === 'upload') { if (ftSessionId && t.sessionId === ftSessionId) ftRemoteRefresh(); } else ftLocalRefresh();
  const dir = t.direction === 'upload' ? '上传' : '下载';
  const place = t.direction === 'upload' ? '远程' : '本地';
  // 传了什么：多文件给数量，单文件给文件名（兜底「文件」，避免出现空白）
  const what = t.filesTotal > 1 ? `${t.filesTotal} 个文件` : (t.curName || '文件');
  const label = t.state === 'done' ? '✅ 传输完成' : (t.state === 'cancelled' ? '已取消传输' : '❌ 传输失败');
  showToast(label, t.state === 'failed' ? (t.error || what) : what);
  // 系统通知（复用 app.js 的统一通知，尊重用户通知开关；取消不打扰）
  if (t.state !== 'cancelled' && typeof sendDesktopNotification === 'function') {
    const title = t.state === 'done' ? `${dir}完成` : `${dir}失败`;
    const body = t.state === 'done'
      ? `${what} 已${dir}到${place}`
      : `${what} ${dir}失败${t.error ? '：' + t.error : ''}`;
    sendDesktopNotification(title, body, t.state === 'done', { target: 'filetransfer' });
  }
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
