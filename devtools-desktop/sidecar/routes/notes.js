/**
 * 工作日志/工时内容 API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

// GET /api/notes
router.get('/', (req, res) => {
  const notes = db.prepare('SELECT date, title, substr(content, 1, 60) as preview, updatedAt FROM notes ORDER BY date DESC').all();
  res.json(notes);
});

// GET /api/notes/:date
router.get('/:date', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE date = ?').get(req.params.date);
  if (!note) return res.status(404).json({ error: '该日期没有日志' });
  res.json(note);
});

// POST /api/notes
router.post('/', (req, res) => {
  const { date, content = '', title = '' } = req.body;
  if (!date) return res.status(400).json({ error: '日期不能为空' });

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);

  if (existing) {
    db.prepare('UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE date = ?')
      .run(title, content, now, date);
  } else {
    db.prepare('INSERT INTO notes (date, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(date, title, content, now, now);
  }

  const note = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);
  res.json(note);
});

// DELETE /api/notes/:date
router.delete('/:date', (req, res) => {
  const result = db.prepare('DELETE FROM notes WHERE date = ?').run(req.params.date);
  if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });
  res.json({ success: true });
});

module.exports = router;
