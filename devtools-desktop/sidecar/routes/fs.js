/**
 * 本地文件操作 API（文件传输页 T2：本地栏的列目录 + 增删改）
 *
 * 本地栏走 Node sidecar 直接读盘（无沙箱、整盘可读），API 形态刻意与远程 /api/sftp/:sid
 * 对齐（{path, items:[{name,isDir,isSymlink,isFile,size,mtime,mode}]}），方便前端两栏共享
 * 同一套渲染。
 *
 * 与「编辑器」的 /api/editor/browse 区别：那个是编辑向、会跳过 node_modules；文件管理器要
 * 看到全部内容（含 node_modules、隐藏文件），故另起一套，互不影响。
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');

// 展开 ~ 家目录
function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function sortDirFirst(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name, 'zh-CN');
}

// GET /api/fs/local/list?path= — 列本地目录（形态对齐远程 list；省略则从家目录）
router.get('/local/list', (req, res) => {
  try {
    const dir = path.resolve(expandHome(req.query.path) || os.homedir());
    const st = fs.statSync(dir);
    if (!st.isDirectory()) return res.status(400).json({ error: '不是目录', path: dir });

    const items = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      let isDir = d.isDirectory();
      const isSymlink = d.isSymbolicLink();
      let size = 0, mtime = 0, mode = null;
      try {
        const ls = fs.lstatSync(full);
        mode = ls.mode; mtime = ls.mtimeMs; size = ls.size;
        // 软链按目标判定是否目录（用于排序/进入），坏链则按非目录
        if (isSymlink) { try { isDir = fs.statSync(full).isDirectory(); } catch { isDir = false; } }
      } catch { /* 无权限/坏链也展示，属性留空 */ }
      items.push({ name: d.name, isDir, isSymlink, isFile: !isDir && !isSymlink, size, mtime, mode });
    }
    items.sort(sortDirFirst);

    const parent = dir === path.parse(dir).root ? null : path.dirname(dir);
    res.json({ path: dir, parent, home: os.homedir(), items });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: '目录不存在' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有访问权限' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fs/local/stat?path= — 单项属性（lstat，不跟软链）
router.get('/local/stat', (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ error: 'path 必填' });
    const p = path.resolve(expandHome(req.query.path));
    const ls = fs.lstatSync(p);
    res.json({
      path: p, isDir: ls.isDirectory(), isSymlink: ls.isSymbolicLink(), isFile: ls.isFile(),
      size: ls.size, mtime: ls.mtimeMs, mode: ls.mode,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: '不存在' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有访问权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fs/local/mkdir { path } — 新建目录
router.post('/local/mkdir', (req, res) => {
  try {
    const raw = expandHome(req.body && req.body.path);
    if (!raw) return res.status(400).json({ error: 'path 必填' });
    const abs = path.resolve(raw);
    if (fs.existsSync(abs)) return res.status(409).json({ error: '目标已存在' });
    fs.mkdirSync(abs); // 不递归：上级不存在则报错，避免误造一串目录
    res.json({ ok: true, path: abs });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(400).json({ error: '上级目录不存在' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有写入权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fs/local/rename { from, to } — 重命名/移动
router.post('/local/rename', (req, res) => {
  try {
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'from 和 to 必填' });
    const a = path.resolve(expandHome(from));
    const b = path.resolve(expandHome(to));
    if (!fs.existsSync(a)) return res.status(404).json({ error: '源不存在' });
    if (fs.existsSync(b)) return res.status(409).json({ error: '目标已存在' });
    fs.renameSync(a, b);
    res.json({ ok: true, from: a, to: b });
  } catch (e) {
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fs/local/delete { path, recursive } — 删除（不跟软链、拒删根/家目录）
router.post('/local/delete', (req, res) => {
  try {
    const raw = expandHome(req.body && req.body.path);
    const recursive = !!(req.body && req.body.recursive);
    if (!raw) return res.status(400).json({ error: 'path 必填' });
    const abs = path.resolve(raw);
    if (abs === path.parse(abs).root || abs === os.homedir()) {
      return res.status(400).json({ error: '拒绝删除根目录或家目录' });
    }
    const ls = fs.lstatSync(abs); // 不跟软链：软链按本身删
    if (ls.isDirectory()) {
      if (!recursive) fs.rmdirSync(abs);            // 非空会抛 ENOTEMPTY
      else fs.rmSync(abs, { recursive: true });     // 递归删（内部软链 unlink，不跟进目标）
    } else {
      fs.unlinkSync(abs);                            // 文件或软链：删本身
    }
    res.json({ ok: true, path: abs });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: '目标不存在' });
    if (e.code === 'ENOTEMPTY') return res.status(400).json({ error: '目录非空（需勾选递归删除）' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有权限' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
