/**
 * 持久 SFTP 会话池
 *
 * 现状每次 browse/部署预检都新建 SSH 再断开——选目录够用，但 FileZilla 式文件管理要
 * 频繁翻目录 + 连续传输，逐次重连又慢、又可能触发服务器认证频率限制。这里按 serverId
 * 持活一条 ssh2 Client + sftp 通道：
 *  - connect → 返回 sessionId（同一服务器已有存活会话则直接复用，避免重复建连）
 *  - get(sessionId) 取回会话（含 conn/sftp）供远程 list/传输/增删改复用同一通道
 *  - keepalive 心跳探活 + 续期；空闲 5min 自动回收，避免句柄泄漏
 *
 * 注：v1 只承载会话生命周期；远程文件操作 / 传输队列在后续批次（T1/T3）接入。
 */
const { v4: uuidv4 } = require('uuid');
const { createSshConnection } = require('./ssh');

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;   // 空闲 5 分钟自动回收
const SWEEP_INTERVAL_MS = 60 * 1000;     // 每分钟巡检一次空闲会话

// sessionId -> { id, serverId, server, conn, sftp, createdAt, lastUsedAt }
const sessions = new Map();
// serverId -> sessionId（一台服务器复用同一条会话）
const byServer = new Map();

function touch(session) {
  session.lastUsedAt = Date.now();
}

/**
 * 销毁会话：先摘登记再 end 连接，保证 close/end/error 事件回调里的二次 destroy 是空操作，
 * 避免递归。
 * @returns {boolean} 是否确实销毁了一个存在的会话
 */
function destroy(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  sessions.delete(sessionId);
  if (byServer.get(s.serverId) === sessionId) byServer.delete(s.serverId);
  try { s.conn.end(); } catch { /* ignore */ }
  return true;
}

/**
 * 建立或复用一个服务器的持久会话。
 * @param {Object} server 服务器记录（含加密密码）
 * @param {Object} [opts] 透传给 createSshConnection 的额外项
 * @returns {Promise<{sessionId: string, serverId: string, reused: boolean}>}
 */
async function connect(server, opts = {}) {
  // 已有存活会话直接复用，避免重复建连
  const existingId = byServer.get(server.id);
  if (existingId && sessions.has(existingId)) {
    touch(sessions.get(existingId));
    return { sessionId: existingId, serverId: server.id, reused: true };
  }

  // 持久会话开协议级 keepalive，配合空闲巡检双保险
  const conn = await createSshConnection(server, {
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
    ...opts,
  });

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, channel) => (err ? reject(err) : resolve(channel)));
  }).catch((err) => {
    try { conn.end(); } catch { /* ignore */ }
    throw new Error(`SFTP 通道建立失败: ${err.message}`);
  });

  const sessionId = `sftp-${uuidv4().slice(0, 8)}`;
  const session = {
    id: sessionId,
    serverId: server.id,
    server: {
      id: server.id, name: server.name, host: server.host,
      port: server.port, username: server.username,
    },
    conn,
    sftp,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  sessions.set(sessionId, session);
  byServer.set(server.id, sessionId);

  // 连接异常/对端关闭时摘除登记，避免后续拿到死会话
  const cleanup = () => destroy(sessionId);
  conn.on('error', cleanup);
  conn.on('close', cleanup);
  conn.on('end', cleanup);

  return { sessionId, serverId: server.id, reused: false };
}

/**
 * 取回会话并续期空闲计时（远程操作前调用）。
 * @returns {Object|null}
 */
function get(sessionId) {
  const s = sessions.get(sessionId);
  if (s) touch(s);
  return s || null;
}

/**
 * 主动断开会话。
 */
function disconnect(sessionId) {
  return destroy(sessionId);
}

/**
 * keepalive 心跳：用 sftp.realpath('.') 轻量探活，顺带续期；探活失败则回收死会话。
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function keepalive(sessionId) {
  return new Promise((resolve) => {
    const s = sessions.get(sessionId);
    if (!s) return resolve({ ok: false, error: '会话不存在或已回收' });
    s.sftp.realpath('.', (err) => {
      if (err) { destroy(sessionId); return resolve({ ok: false, error: err.message }); }
      touch(s);
      resolve({ ok: true });
    });
  });
}

/**
 * 列出当前活跃会话（脱敏：不含 conn/sftp 句柄）。
 */
function list() {
  const now = Date.now();
  return Array.from(sessions.values()).map((s) => ({
    sessionId: s.id,
    serverId: s.serverId,
    server: s.server,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    idleMs: now - s.lastUsedAt,
  }));
}

// 空闲巡检：超过 IDLE_TIMEOUT_MS 未使用的会话自动回收；unref 避免拖住进程退出
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsedAt > IDLE_TIMEOUT_MS) destroy(id);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = { connect, get, disconnect, destroy, keepalive, list, IDLE_TIMEOUT_MS };
