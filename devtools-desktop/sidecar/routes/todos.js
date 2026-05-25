/**
 * 待办/看板 CRUD API
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/todos.json');

function readTodos() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeTodos(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function genId() {
  return 'todo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// GET /api/todos — 列表
router.get('/', (req, res) => {
  res.json(readTodos());
});

// POST /api/todos — 新增
router.post('/', (req, res) => {
  const { title, content = '', status = 'todo' } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });

  const todos = readTodos();
  const todo = {
    id: genId(),
    title: title.trim(),
    content: content.trim(),
    status, // todo | doing | done
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  todos.unshift(todo);
  writeTodos(todos);
  res.json(todo);
});

// PUT /api/todos/:id — 更新
router.put('/:id', (req, res) => {
  const todos = readTodos();
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '任务不存在' });

  const { title, content, status } = req.body;
  if (title !== undefined) todos[idx].title = title.trim();
  if (content !== undefined) todos[idx].content = content.trim();
  if (status !== undefined) todos[idx].status = status;
  todos[idx].updatedAt = new Date().toISOString();

  writeTodos(todos);
  res.json(todos[idx]);
});

// PUT /api/todos/reorder — 批量更新排序
router.put('/', (req, res) => {
  const { todos: newOrder } = req.body;
  if (!Array.isArray(newOrder)) return res.status(400).json({ error: '数据格式错误' });
  writeTodos(newOrder);
  res.json({ success: true });
});

// DELETE /api/todos/:id — 删除
router.delete('/:id', (req, res) => {
  const todos = readTodos();
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '任务不存在' });
  todos.splice(idx, 1);
  writeTodos(todos);
  res.json({ success: true });
});

// DELETE /api/todos — 清空已完成
router.delete('/', (req, res) => {
  const todos = readTodos();
  const remaining = todos.filter(t => t.status !== 'done');
  writeTodos(remaining);
  res.json({ success: true, deleted: todos.length - remaining.length });
});

module.exports = router;
