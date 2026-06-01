/**
 * 终端标签页会话持久化 API
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

// 获取所有终端会话
router.get('/sessions', (req, res) => {
  try {
    const sessions = db.prepare('SELECT * FROM terminal_sessions ORDER BY sortOrder ASC').all();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: '获取终端会话失败: ' + err.message });
  }
});

// 保存或替换终端会话
router.post('/sessions', (req, res) => {
  const { id, name, cwd, nodeVersion = '' } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'id 和 name 必填' });
  }

  try {
    // 自动计算 sortOrder
    const maxSort = db.prepare('SELECT MAX(sortOrder) as maxSort FROM terminal_sessions').get()?.maxSort || 0;
    const sortOrder = maxSort + 1;

    db.prepare(`
      INSERT OR REPLACE INTO terminal_sessions (id, name, cwd, nodeVersion, sortOrder)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, cwd || '', nodeVersion, sortOrder);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: '保存终端会话失败: ' + err.message });
  }
});

// 更新终端会话（支持增量更新 cwd 或 name）
router.put('/sessions/:id', (req, res) => {
  const { id } = req.params;
  const { name, cwd, nodeVersion } = req.body;

  try {
    // 先获取已有数据以供合并
    const existing = db.prepare('SELECT * FROM terminal_sessions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '未找到对应终端会话' });
    }

    const finalName = name !== undefined ? name : existing.name;
    const finalCwd = cwd !== undefined ? cwd : existing.cwd;
    const finalNodeVersion = nodeVersion !== undefined ? nodeVersion : existing.nodeVersion;

    db.prepare(`
      UPDATE terminal_sessions
      SET name = ?, cwd = ?, nodeVersion = ?
      WHERE id = ?
    `).run(finalName, finalCwd, finalNodeVersion, id);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: '更新终端会话失败: ' + err.message });
  }
});

// 删除终端会话
router.delete('/sessions/:id', (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM terminal_sessions WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '未找到对应终端会话' });
    }
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: '删除终端会话失败: ' + err.message });
  }
});

module.exports = router;
