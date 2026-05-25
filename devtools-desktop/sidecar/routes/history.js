/**
 * 部署历史 API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

// GET /api/history — 历史列表（不含 logs）
router.get('/', (req, res) => {
  const history = db.prepare('SELECT id, projectName, type, status, modules, serverName, nodeVersion, remotePath, duration, timestamp FROM history ORDER BY timestamp DESC').all();
  res.json(history.map(h => ({ ...h, modules: JSON.parse(h.modules || '[]') })));
});

// GET /api/history/:id — 某条记录（含 logs）
router.get('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM history WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  record.modules = JSON.parse(record.modules || '[]');
  res.json(record);
});

// DELETE /api/history/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM history WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });
  const remaining = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  res.json({ success: true, remaining });
});

// DELETE /api/history — 批量删除
router.delete('/', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids 必须是非空数组' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM history WHERE id IN (${placeholders})`).run(...ids);
  const remaining = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  res.json({ success: true, deleted: result.changes, remaining });
});

// POST /api/history/cleanup
router.post('/cleanup', (req, res) => {
  const { keepDays = 30, keepPerProject = 5 } = req.body || {};
  const before = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();

  // 删除超期的失败记录
  db.prepare("DELETE FROM history WHERE status != 'success' AND timestamp < ?").run(cutoff);

  // 对每个项目只保留最近 N 条成功记录
  const projects = db.prepare("SELECT DISTINCT projectName FROM history WHERE status = 'success'").all();
  for (const { projectName } of projects) {
    const ids = db.prepare("SELECT id FROM history WHERE projectName = ? AND status = 'success' ORDER BY timestamp DESC LIMIT -1 OFFSET ?")
      .all(projectName, keepPerProject)
      .map(r => r.id);
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM history WHERE id IN (${ph})`).run(...ids);
    }
  }

  const after = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  res.json({ success: true, before, after, deleted: before - after, strategy: `每项目保留 ${keepPerProject} 条成功 + ${keepDays} 天内失败记录` });
});

module.exports = router;
