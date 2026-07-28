const express = require('express');
const router = express.Router();
const db = require('../services/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGES_DIR = path.join(__dirname, '../data/notebook-images');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const IMAGE_FILENAME = /^[a-f0-9]{16}\.(?:png|jpg|webp|gif)$/;
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function genId() {
  return 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function hasExpectedImageHeader(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimeType === 'image/gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  return false;
}

function notePreview(content) {
  return String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*`>\-[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function noteSummary(note) {
  return {
    id: note.id,
    title: note.title,
    preview: notePreview(note.content),
    pinned: note.pinned,
    sortOrder: note.sortOrder,
    hasMedia: /<img\b/i.test(String(note.content || '')),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function noteRecord(note) {
  return { ...noteSummary(note), content: String(note.content || '') };
}

// POST /api/notebook/upload — 只接收经过类型和文件头校验的 base64 图片
router.post('/upload', (req, res) => {
  const { data, mimeType, size } = req.body;
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: '没有图片数据' });
  const ext = IMAGE_TYPES[mimeType];
  if (!ext) return res.status(415).json({ error: '仅支持 PNG、JPEG、WebP 和 GIF 图片' });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    return res.status(400).json({ error: '图片数据格式无效' });
  }

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || Number(size || buffer.length) > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: '图片不能超过 8MB' });
  }
  if (!hasExpectedImageHeader(buffer, mimeType)) {
    return res.status(400).json({ error: '图片内容与声明类型不一致' });
  }

  const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, name), buffer);
  res.json({ url: `/api/notebook/images/${name}` });
});

// GET /api/notebook/images/:filename — 静态图片访问
router.get('/images/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!IMAGE_FILENAME.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: '图片名称无效' });
  }
  const filePath = path.join(IMAGES_DIR, filename);
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
  res.json(notes.map(noteSummary));
});

// GET /api/notebook/:id
router.get('/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notebook_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: '笔记不存在' });
  res.json(noteRecord(note));
});

// POST /api/notebook
router.post('/', (req, res) => {
  const { title = '', content = '' } = req.body;
  const id = genId();
  const now = new Date().toISOString();
  const tags = [];
  db.prepare('INSERT INTO notebook_notes (id, title, content, pinned, tags, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)').run(id, title, content, JSON.stringify(tags), now, now);
  const created = db.prepare('SELECT * FROM notebook_notes WHERE id = ?').get(id);
  res.json(noteRecord(created));
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
  db.prepare('UPDATE notebook_notes SET title = ?, content = ?, pinned = ?, updatedAt = ? WHERE id = ?').run(newTitle, newContent, newPinned, now, req.params.id);
  res.json(noteRecord({ ...note, title: newTitle, content: newContent, pinned: newPinned, updatedAt: now }));
});

// DELETE /api/notebook/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM notebook_notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '笔记不存在' });
  res.json({ success: true });
});

module.exports = router;
