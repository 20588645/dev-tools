const express = require('express');
const router = express.Router();
const db = require('../services/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGES_DIR = path.join(__dirname, '../data/notebook-images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function genId() {
  return 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// POST /api/notebook/upload — 图片上传（接收 base64 或 multipart）
router.post('/upload', (req, res) => {
  const { data, filename } = req.body; // data: base64 字符串
  if (!data) return res.status(400).json({ error: '没有图片数据' });

  // 生成唯一文件名
  const ext = (filename || 'image.png').split('.').pop() || 'png';
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  const filePath = path.join(IMAGES_DIR, name);

  // 写入文件
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);

  // 返回访问 URL
  const url = `/api/notebook/images/${name}`;
  res.json({ url });
});

// GET /api/notebook/images/:filename — 静态图片访问
router.get('/images/:filename', (req, res) => {
  const filePath = path.join(IMAGES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '图片不存在' });
  res.sendFile(filePath);
});

// GET /api/notebook/tags/list - get all unique tags (must be before /:id)
router.get('/tags/list', (req, res) => {
  const notes = db.prepare('SELECT tags FROM notebook_notes').all();
  const tagMap = {};
  notes.forEach(n => {
    const tags = JSON.parse(n.tags || '[]');
    tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
  });
  const tagList = Object.entries(tagMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  res.json(tagList);
});

// GET /api/notebook - list all notes (without full content)
router.get('/', (req, res) => {
  const { tag, search } = req.query;
  let notes;
  if (search) {
    notes = db.prepare("SELECT id, title, content, pinned, tags, sortOrder, createdAt, updatedAt FROM notebook_notes WHERE title LIKE ? OR content LIKE ? ORDER BY pinned DESC, sortOrder ASC, createdAt DESC").all(`%${search}%`, `%${search}%`);
  } else if (tag) {
    notes = db.prepare("SELECT id, title, content, pinned, tags, sortOrder, createdAt, updatedAt FROM notebook_notes WHERE tags LIKE ? ORDER BY pinned DESC, sortOrder ASC, createdAt DESC").all(`%"${tag}"%`);
  } else {
    notes = db.prepare("SELECT id, title, content, pinned, tags, sortOrder, createdAt, updatedAt FROM notebook_notes ORDER BY pinned DESC, sortOrder ASC, createdAt DESC").all();
  }
  res.json(notes.map(n => ({ ...n, tags: JSON.parse(n.tags || '[]'), preview: (n.content || '').replace(/[#*`>\-\[\]]/g, '').slice(0, 80) })));
});

// GET /api/notebook/:id
router.get('/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notebook_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: '笔记不存在' });
  note.tags = JSON.parse(note.tags || '[]');
  res.json(note);
});

// POST /api/notebook
router.post('/', (req, res) => {
  const { title = '', content = '' } = req.body;
  const id = genId();
  const now = new Date().toISOString();
  const tags = extractTags(content);
  db.prepare('INSERT INTO notebook_notes (id, title, content, pinned, tags, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)').run(id, title, content, JSON.stringify(tags), now, now);
  res.json({ id, title, content, pinned: 0, tags, createdAt: now, updatedAt: now });
});

// PUT /api/notebook/reorder — 批量更新排序（必须在 /:id 之前）
router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: '需要 ids 数组' });
  const stmt = db.prepare('UPDATE notebook_notes SET sortOrder = ? WHERE id = ?');
  const updateAll = db.transaction((idList) => {
    idList.forEach((id, i) => stmt.run(i, id));
  });
  updateAll(ids);
  res.json({ success: true });
});

// PUT /api/notebook/:id
router.put('/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notebook_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: '笔记不存在' });
  const { title, content, pinned } = req.body;
  const now = new Date().toISOString();
  const newContent = content !== undefined ? content : note.content;
  const newTitle = title !== undefined ? title : note.title;
  const newPinned = pinned !== undefined ? (pinned ? 1 : 0) : note.pinned;
  const tags = extractTags(newContent);
  db.prepare('UPDATE notebook_notes SET title = ?, content = ?, pinned = ?, tags = ?, updatedAt = ? WHERE id = ?').run(newTitle, newContent, newPinned, JSON.stringify(tags), now, req.params.id);
  res.json({ ...note, title: newTitle, content: newContent, pinned: newPinned, tags, updatedAt: now });
});

// DELETE /api/notebook/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM notebook_notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '笔记不存在' });
  res.json({ success: true });
});

function extractTags(content) {
  if (!content) return [];
  const matches = content.match(/#([^\s#]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))].filter(t => t.length > 0 && t.length < 30);
}

module.exports = router;
