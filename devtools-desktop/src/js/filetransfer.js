// ========== filetransfer.js — 文件传输页（FileZilla 式双栏 SFTP）==========
// T4 范围：页面骨架 + 菜单 + 会话连接栏。本地/远程目录浏览与上传下载在后续批次接入。
// 会话连接栏直接驱动后端持久 SFTP 会话（/api/sftp/connect|disconnect|keepalive，T0 基建）。

// 当前会话：sessionId 为后端持久会话标识，断开/失效后置空
let ftSessionId = null;
let ftCurrentServer = null;
let ftKeepaliveTimer = null;

// 1min 心跳：远低于后端 5min 空闲回收阈值，避免翻目录间隙会话被回收
const FT_KEEPALIVE_MS = 60 * 1000;

// 页面进入时初始化：刷新服务器下拉 + 渲染两栏/队列占位 + 按当前会话态同步 UI（幂等）
function initFileTransfer() {
  ftRenderServerOptions();
  ftRenderLocalPlaceholder();
  ftRenderQueuePlaceholder();
  ftSyncSessionUI();
}

// 用全局 servers（部署面板已加载）填充服务器下拉；连接中锁定下拉，断开后才能切换
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

// 连接/断开切换：按当前会话态分发
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
      // 建连可能较慢，超时与后端一致（避免默认 15s 误杀慢连接）
      const res = await API.post('/api/sftp/connect', { serverId }, getConnTimeoutMs());
      ftSessionId = res.sessionId;
      ftCurrentServer = server;
    });
    ftStartKeepalive();
    ftSyncSessionUI();
    showToast('✅ 已连接', server.name || server.host);
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
    // 断开失败不阻塞前端复位（会话最终会被后端空闲回收）
    console.warn('[FileTransfer] 断开失败:', e.message);
  } finally {
    ftSessionId = null;
    ftCurrentServer = null;
    ftSyncSessionUI();
    showToast('已断开连接');
  }
}

// 按当前会话态同步：连接按钮文案/变体、下拉锁定、状态药丸、远程栏路径与占位
function ftSyncSessionUI() {
  const btn = document.getElementById('ftConnectBtn');
  const sel = document.getElementById('ftServerSelect');
  const refresh = document.getElementById('ftRefreshBtn');
  const remotePath = document.getElementById('ftRemotePath');
  const connected = !!ftSessionId;

  if (btn) {
    btn.textContent = connected ? '断开' : '连接';
    btn.classList.toggle('btn--primary', !connected);
    btn.classList.toggle('btn--danger', connected);
  }
  if (sel) sel.disabled = connected || !(Array.isArray(servers) && servers.length);
  if (refresh) refresh.disabled = true; // 目录刷新随 T5 列目录一起启用

  if (connected && ftCurrentServer) {
    const where = `${ftCurrentServer.username || ''}@${ftCurrentServer.host || ''}`;
    ftSetStatus('connected', `已连接 · ${where}`);
    const dir = ftCurrentServer.defaultRemotePath || '~';
    if (remotePath) { remotePath.textContent = dir; remotePath.title = dir; }
    ftRenderRemoteBody({ kind: 'empty', icon: '✅', title: '会话已建立', desc: '持久 SFTP 会话已连接，远程目录浏览将在下一批（T5）接入。' });
  } else {
    ftSetStatus('idle', '未连接');
    if (remotePath) { remotePath.textContent = '—'; remotePath.title = ''; }
    ftRenderRemoteBody({ kind: 'empty', icon: '🖥', title: '远程文件浏览', desc: '未连接，请选择服务器后点击「连接」。' });
  }
}

// 状态药丸：idle 灰 / connecting 黄 / connected 绿（真实语义着色）
function ftSetStatus(kind, text) {
  const wrap = document.getElementById('ftSessionStatus');
  if (!wrap) return;
  wrap.classList.remove('is-connected', 'is-connecting');
  if (kind === 'connected') wrap.classList.add('is-connected');
  else if (kind === 'connecting') wrap.classList.add('is-connecting');
  const t = wrap.querySelector('.ft-status-text');
  if (t) t.textContent = text;
}

// ---------- 心跳：保活会话，失效则复位为未连接 ----------
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
    // 410（会话已回收）或网络错误：复位为未连接，提示重连
    ftStopKeepalive();
    ftSessionId = null;
    ftCurrentServer = null;
    ftSyncSessionUI();
    ftRenderRemoteBody({ kind: 'error', title: '连接已断开', desc: '会话失效，请重新连接。' });
    showToast('⚠️ SFTP 会话已断开', '请重新连接');
  }
}

// ---------- 占位渲染（list/queue 实体在后续批次接入） ----------
function ftRenderLocalPlaceholder() {
  renderState(document.getElementById('ftLocalBody'), {
    kind: 'empty', icon: '💻',
    title: '本地文件浏览',
    desc: '本地目录浏览与新建/重命名/删除将在下一批（T5）接入；当前为页面骨架。',
  });
}

function ftRenderRemoteBody(opts) {
  renderState(document.getElementById('ftRemoteBody'), opts);
}

function ftRenderQueuePlaceholder() {
  renderState(document.getElementById('ftQueueBody'), {
    kind: 'empty', icon: '📭',
    title: '暂无传输任务',
    desc: '上传 / 下载任务会显示在这里（含字节级进度），随传输接入。',
    sm: true,
  });
}

// 刷新两栏目录：占位（T5 列目录接入后启用，按钮当前 disabled）
function ftRefreshAll() {
  // T5：分别刷新本地与远程目录列表
}
