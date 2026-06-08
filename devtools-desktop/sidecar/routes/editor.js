const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../services/database');

function genDraftId() {
  return 'draft-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ===== 草稿（未命名标签，存入 SQLite，类似笔记本）=====

// GET /api/editor/drafts — 列出所有草稿
router.get('/drafts', (req, res) => {
  const rows = db.prepare('SELECT id, title, content, sortOrder, updatedAt FROM editor_drafts ORDER BY sortOrder ASC, updatedAt ASC').all();
  res.json(rows);
});

// POST /api/editor/drafts — 新建草稿
router.post('/drafts', (req, res) => {
  const { title = '', content = '' } = req.body;
  const id = genDraftId();
  const maxRow = db.prepare('SELECT MAX(sortOrder) AS m FROM editor_drafts').get();
  const sortOrder = (maxRow && maxRow.m != null ? maxRow.m : -1) + 1;
  db.prepare('INSERT INTO editor_drafts (id, title, content, sortOrder) VALUES (?, ?, ?, ?)').run(id, title, content, sortOrder);
  res.json({ id, title, content, sortOrder });
});

// PUT /api/editor/drafts/:id — 更新草稿
router.put('/drafts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM editor_drafts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '草稿不存在' });
  const { title, content } = req.body;
  const newTitle = title !== undefined ? title : existing.title;
  const newContent = content !== undefined ? content : existing.content;
  db.prepare("UPDATE editor_drafts SET title = ?, content = ?, updatedAt = datetime('now') WHERE id = ?").run(newTitle, newContent, req.params.id);
  res.json({ id: req.params.id, title: newTitle, content: newContent });
});

// DELETE /api/editor/drafts/:id — 删除草稿
router.delete('/drafts/:id', (req, res) => {
  db.prepare('DELETE FROM editor_drafts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const MAX_SIZE = 8 * 1024 * 1024; // 8MB 上限，避免把超大文件灌进 WebView

// 判断是否为二进制文件（前 8KB 内出现 NUL 字节即视为二进制）
function looksBinary(buf) {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

// 探测换行符风格
function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  if (crlf > 0 && crlf >= lf) return 'CRLF';
  return 'LF';
}

// 安全展开 ~ 家目录
function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// GET /api/editor/browse?dir= — 浏览目录（应用内文件浏览器，列出子目录与文件）
router.get('/browse', (req, res) => {
  try {
    let targetDir = expandHome(req.query.dir) || os.homedir();
    targetDir = path.resolve(targetDir);

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) return res.status(400).json({ error: '不是目录' });

    const dirs = [];
    const files = [];
    for (const d of fs.readdirSync(targetDir, { withFileTypes: true })) {
      // 跳过 node_modules（体积大、无编辑意义），其余包括隐藏文件都展示（方便编辑 .env 等）
      if (d.name === 'node_modules') continue;
      const fullPath = path.join(targetDir, d.name);
      let isDir = d.isDirectory();
      // 处理符号链接
      if (d.isSymbolicLink()) {
        try { isDir = fs.statSync(fullPath).isDirectory(); } catch (e) { continue; }
      }
      if (isDir) {
        dirs.push({ name: d.name, path: fullPath, isDir: true });
      } else if (d.isFile() || d.isSymbolicLink()) {
        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch (e) {}
        files.push({ name: d.name, path: fullPath, isDir: false, size });
      }
    }
    const byName = (a, b) => a.name.localeCompare(b.name, 'zh-CN');
    dirs.sort(byName);
    files.sort(byName);

    const parent = targetDir === '/' ? null : path.dirname(targetDir);
    res.json({ currentDir: targetDir, parent, home: os.homedir(), entries: [...dirs, ...files] });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: '目录不存在' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有访问权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/editor/read — 读取文件内容
router.post('/read', (req, res) => {
  try {
    let filePath = expandHome(req.body.path);
    if (!filePath) return res.status(400).json({ error: '缺少文件路径' });
    filePath = path.resolve(filePath);

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return res.status(400).json({ error: '这是一个目录，不是文件' });
    if (stat.size > MAX_SIZE) {
      return res.status(413).json({ error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），超过 8MB 上限` });
    }

    const buf = fs.readFileSync(filePath);
    if (looksBinary(buf)) {
      return res.status(415).json({ error: '这是二进制文件，无法以文本方式编辑' });
    }

    let content = buf.toString('utf8');
    const eol = detectEol(content);
    // 统一为 LF 在编辑器中展示，保存时再按原风格写回
    content = content.replace(/\r\n/g, '\n');

    res.json({
      path: filePath,
      name: path.basename(filePath),
      ext: (path.extname(filePath).slice(1) || '').toLowerCase(),
      content,
      size: stat.size,
      eol,
      mtime: stat.mtimeMs,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: '文件不存在' });
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有访问权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/editor/write — 写回文件
router.post('/write', (req, res) => {
  try {
    let filePath = expandHome(req.body.path);
    const { content = '', eol = 'LF' } = req.body;
    if (!filePath) return res.status(400).json({ error: '缺少文件路径' });
    filePath = path.resolve(filePath);

    // 编辑器内统一用 LF，按目标换行风格写回
    let out = String(content).replace(/\r\n/g, '\n');
    if (eol === 'CRLF') out = out.replace(/\n/g, '\r\n');

    fs.writeFileSync(filePath, out, 'utf8');
    const stat = fs.statSync(filePath);
    res.json({ ok: true, size: stat.size, mtime: stat.mtimeMs });
  } catch (e) {
    if (e.code === 'EACCES') return res.status(403).json({ error: '没有写入权限' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/editor/create — 在指定目录新建空文件
router.post('/create', (req, res) => {
  try {
    let dir = expandHome(req.body.dir || os.homedir());
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '缺少文件名' });
    if (name.includes('/') || name.includes('\\')) return res.status(400).json({ error: '文件名不能包含路径分隔符' });
    const filePath = path.resolve(path.join(dir, name));
    if (fs.existsSync(filePath)) return res.status(409).json({ error: '文件已存在' });
    fs.writeFileSync(filePath, '', 'utf8');
    res.json({ ok: true, path: filePath, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/editor/stat — 查询文件是否被外部修改（供未来扩展）
router.get('/stat', (req, res) => {
  try {
    const filePath = path.resolve(expandHome(req.query.path));
    const stat = fs.statSync(filePath);
    res.json({ exists: true, mtime: stat.mtimeMs, size: stat.size });
  } catch (e) {
    res.json({ exists: false });
  }
});

module.exports = router;
