/**
 * 待办/看板 CRUD API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

function genId() {
  return 'todo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// GET /api/todos
router.get('/', (req, res) => {
  const todos = db.prepare('SELECT * FROM todos ORDER BY createdAt DESC').all();
  res.json(todos);
});

// POST /api/todos
router.post('/', (req, res) => {
  const { title, content = '', status = 'todo' } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });

  const id = genId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO todos (id, title, content, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, title.trim(), content.trim(), status, now, now);

  res.json({ id, title: title.trim(), content: content.trim(), status, createdAt: now, updatedAt: now });
});

// PUT /api/todos/:id
router.put('/:id', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) return res.status(404).json({ error: '任务不存在' });

  const { title, content, status } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE todos SET title = ?, content = ?, status = ?, updatedAt = ? WHERE id = ?')
    .run(title !== undefined ? title.trim() : todo.title, content !== undefined ? content.trim() : todo.content, status !== undefined ? status : todo.status, now, req.params.id);

  res.json({ ...todo, title: title !== undefined ? title.trim() : todo.title, content: content !== undefined ? content.trim() : todo.content, status: status !== undefined ? status : todo.status, updatedAt: now });
});

// DELETE /api/todos/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '任务不存在' });
  res.json({ success: true });
});

// DELETE /api/todos — 清空已完成
router.delete('/', (req, res) => {
  const result = db.prepare("DELETE FROM todos WHERE status = 'done'").run();
  res.json({ success: true, deleted: result.changes });
});

module.exports = router;
