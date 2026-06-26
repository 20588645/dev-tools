/**
 * 持久 SFTP 会话 API —— FileZilla 式「文件传输」页的连接基建（T0）
 *
 * 连接复用同一条 ssh2 通道，避免每次翻目录/传输都重新建连。
 * 远程文件操作（list/mkdir/rename/delete）与传输队列在后续批次（T1/T3）挂到同一会话上。
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const sftpSession = require('../services/sftpSession');

// 读服务器记录（含加密密码，供建连用，不脱敏；不经网络返回明文）
function readServers() {
  const rows = db.prepare('SELECT * FROM servers').all();
  return rows.map((r) => ({
    ...r,
    password: r.password ? JSON.parse(r.password) : null,
    port: Number(r.port),
  }));
}

// POST /api/sftp/connect { serverId } — 建立或复用持久会话
router.post('/connect', async (req, res) => {
  try {
    const { serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'serverId 必填' });
    const server = readServers().find((s) => s.id === serverId);
    if (!server) return res.status(404).json({ error: '服务器不存在' });

    const result = await sftpSession.connect(server);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sftp/disconnect { sessionId } — 主动断开会话
router.post('/disconnect', (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId 必填' });
    const ok = sftpSession.disconnect(sessionId);
    res.json({ ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sftp/sessions — 当前活跃会话列表（脱敏）
router.get('/sessions', (req, res) => {
  try {
    res.json({ sessions: sftpSession.list(), idleTimeoutMs: sftpSession.IDLE_TIMEOUT_MS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sftp/:sid/keepalive — 心跳探活 + 续期空闲计时
router.post('/:sid/keepalive', async (req, res) => {
  try {
    const result = await sftpSession.keepalive(req.params.sid);
    if (!result.ok) return res.status(410).json(result); // 410 Gone：会话已失效，前端据此重连
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== T1：远程文件操作（复用持久会话的 sftp 通道） ==========

// 取会话；不存在则回 410（前端据此提示重连）
function getSessionOr410(req, res) {
  const s = sftpSession.get(req.params.sid);
  if (!s) { res.status(410).json({ error: '会话不存在或已回收，请重新连接' }); return null; }
  return s;
}

// POSIX 路径拼接（远程恒为 Linux）
function posixJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

// 解析 ls -l 风格 longname：SFTP attrs 只有数字 uid/gid，属主/属组名只能从 longname 取
function parseLongname(longname) {
  const out = { perms: '', owner: '', group: '', target: '' };
  if (!longname || typeof longname !== 'string') return out;
  const parts = longname.trim().split(/\s+/);
  if (parts[0] && /^[-dlbcps][-rwxStTsl]{9}/.test(parts[0])) out.perms = parts[0].slice(0, 10);
  if (parts.length >= 4) { out.owner = parts[2]; out.group = parts[3]; }
  const arrow = longname.indexOf(' -> ');
  if (arrow !== -1) out.target = longname.slice(arrow + 4).trim();
  return out;
}

// attrs.mode 兜底出权限串（longname 解析不到时用）
function modeToPerms(mode) {
  if (typeof mode !== 'number') return '';
  const t = mode & 0o170000;
  const typeChar = t === 0o040000 ? 'd' : t === 0o120000 ? 'l' : t === 0o100000 ? '-'
    : t === 0o060000 ? 'b' : t === 0o020000 ? 'c' : t === 0o010000 ? 'p' : t === 0o140000 ? 's' : '-';
  const rwx = (n) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  return typeChar + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7);
}

// 类型判断：优先用 ssh2 Stats 的方法，回退 longname 首字符
function entryType(attrs, longname) {
  if (attrs && typeof attrs.isDirectory === 'function') {
    return { isDir: attrs.isDirectory(), isSymlink: attrs.isSymbolicLink(), isFile: attrs.isFile() };
  }
  const c = (longname || '')[0];
  return { isDir: c === 'd', isSymlink: c === 'l', isFile: c === '-' || !c };
}

function mapEntry(item) {
  const { filename, longname, attrs } = item;
  const ln = parseLongname(longname);
  const t = entryType(attrs, longname);
  const mode = attrs && typeof attrs.mode === 'number' ? attrs.mode : null;
  return {
    name: filename,
    isDir: t.isDir,
    isSymlink: t.isSymlink,
    isFile: t.isFile,
    size: attrs && attrs.size ? attrs.size : 0,
    mtime: attrs && attrs.mtime ? attrs.mtime * 1000 : 0,
    perms: ln.perms || modeToPerms(mode),
    owner: ln.owner,
    group: ln.group,
    target: ln.target || undefined,
    mode,
  };
}

function sortDirFirst(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
}

// GET /api/sftp/:sid/list?path= — 列目录（含权限/属主/软链；path 省略或相对则按 home 解析）
router.get('/:sid/list', (req, res) => {
  const s = getSessionOr410(req, res); if (!s) return;
  const reqPath = req.query.path || '.';
  // 先 realpath 解成绝对路径（'.' → home 绝对路径），方便前端面包屑
  s.sftp.realpath(reqPath, (rpErr, abs) => {
    const dir = rpErr ? reqPath : abs;
    s.sftp.readdir(dir, (err, list) => {
      if (err) return res.status(400).json({ error: `目录读取失败: ${err.message}`, path: dir });
      const items = (list || []).map(mapEntry).sort(sortDirFirst);
      res.json({ path: dir, items });
    });
  });
});

// GET /api/sftp/:sid/stat?path= — 取单个路径属性（lstat，不跟软链）
router.get('/:sid/stat', (req, res) => {
  const s = getSessionOr410(req, res); if (!s) return;
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: 'path 必填' });
  s.sftp.lstat(p, (err, attrs) => {
    if (err) return res.status(400).json({ error: `stat 失败: ${err.message}`, path: p });
    res.json({
      path: p,
      isDir: attrs.isDirectory(), isSymlink: attrs.isSymbolicLink(), isFile: attrs.isFile(),
      size: attrs.size || 0,
      mtime: attrs.mtime ? attrs.mtime * 1000 : 0,
      mode: attrs.mode, perms: modeToPerms(attrs.mode),
      uid: attrs.uid, gid: attrs.gid,
    });
  });
});

// POST /api/sftp/:sid/mkdir { path } — 新建目录
router.post('/:sid/mkdir', (req, res) => {
  const s = getSessionOr410(req, res); if (!s) return;
  const p = req.body && req.body.path;
  if (!p) return res.status(400).json({ error: 'path 必填' });
  s.sftp.mkdir(p, (err) => {
    if (err) return res.status(400).json({ error: `新建目录失败: ${err.message}` });
    res.json({ ok: true, path: p });
  });
});

// POST /api/sftp/:sid/rename { from, to } — 重命名/移动
router.post('/:sid/rename', (req, res) => {
  const s = getSessionOr410(req, res); if (!s) return;
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from 和 to 必填' });
  s.sftp.rename(from, to, (err) => {
    if (err) return res.status(400).json({ error: `重命名失败: ${err.message}` });
    res.json({ ok: true, from, to });
  });
});

// POST /api/sftp/:sid/delete { path, recursive } — 删除（文件 unlink / 目录 rmdir）
// 谨慎：recursive 才递归删非空目录；递归时不跟软链（只删链接本身）；拒删根目录
router.post('/:sid/delete', (req, res) => {
  const s = getSessionOr410(req, res); if (!s) return;
  const { path: p, recursive } = req.body || {};
  if (!p) return res.status(400).json({ error: 'path 必填' });
  if (p === '/' || p.trim() === '') return res.status(400).json({ error: '拒绝删除根目录' });
  removePath(s.sftp, p, !!recursive)
    .then(() => res.json({ ok: true, path: p }))
    .catch((err) => res.status(400).json({ error: `删除失败: ${err.message}` }));
});

// 删除分发：目录→（非递归 rmdir / 递归 rmrf）；文件或软链→unlink
function removePath(sftp, p, recursive) {
  return new Promise((resolve, reject) => {
    sftp.lstat(p, (err, attrs) => {
      if (err) return reject(err);
      const isDir = attrs.isDirectory();
      const isLink = attrs.isSymbolicLink();
      if (isDir && !isLink) {
        if (!recursive) return sftp.rmdir(p, (e) => (e ? reject(e) : resolve()));
        return rmrf(sftp, p).then(resolve).catch(reject);
      }
      // 文件或软链：unlink（软链删的是链接本身，不动目标）
      sftp.unlink(p, (e) => (e ? reject(e) : resolve()));
    });
  });
}

// 递归删空：先清子项再 rmdir；子目录递归，软链/文件 unlink（不跟软链，避免删到树外）
async function rmrf(sftp, dir) {
  const entries = await new Promise((resolve, reject) => {
    sftp.readdir(dir, (err, list) => (err ? reject(err) : resolve(list || [])));
  });
  for (const ent of entries) {
    const child = posixJoin(dir, ent.filename);
    const t = entryType(ent.attrs, ent.longname);
    if (t.isDir && !t.isSymlink) {
      await rmrf(sftp, child);
    } else {
      await new Promise((resolve, reject) => sftp.unlink(child, (e) => (e ? reject(e) : resolve())));
    }
  }
  await new Promise((resolve, reject) => sftp.rmdir(dir, (e) => (e ? reject(e) : resolve())));
}

module.exports = router;
