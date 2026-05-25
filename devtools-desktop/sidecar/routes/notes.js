/**
 * 工作日志 CRUD API
 * 每天一条记录，按日期索引
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/notes.json');

function readNotes() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeNotes(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/notes — 列表（按日期倒序，不含完整内容）
router.get('/', (req, res) => {
  const notes = readNotes();
  const list = notes.map(n => ({
    date: n.date,
    preview: (n.content || '').slice(0, 60),
    updatedAt: n.updatedAt,
  }));
  res.json(list);
});

// GET /api/notes/:date — 获取某天的日志
router.get('/:date', (req, res) => {
  const notes = readNotes();
  const note = notes.find(n => n.date === req.params.date);
  if (!note) return res.status(404).json({ error: '该日期没有日志' });
  res.json(note);
});

// POST /api/notes — 新建或更新某天的日志
router.post('/', (req, res) => {
  const { date, content = '', title = '' } = req.body;
  if (!date) return res.status(400).json({ error: '日期不能为空' });

  const notes = readNotes();
  const idx = notes.findIndex(n => n.date === date);

  if (idx >= 0) {
    notes[idx].content = content;
    notes[idx].title = title;
    notes[idx].updatedAt = new Date().toISOString();
  } else {
    notes.unshift({
      date,
      title,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // 按日期倒序排列
    notes.sort((a, b) => b.date.localeCompare(a.date));
  }

  writeNotes(notes);
  res.json(notes.find(n => n.date === date));
});

// DELETE /api/notes/:date — 删除某天的日志
router.delete('/:date', (req, res) => {
  const notes = readNotes();
  const idx = notes.findIndex(n => n.date === req.params.date);
  if (idx === -1) return res.status(404).json({ error: '记录不存在' });
  notes.splice(idx, 1);
  writeNotes(notes);
  res.json({ success: true });
});

module.exports = router;
