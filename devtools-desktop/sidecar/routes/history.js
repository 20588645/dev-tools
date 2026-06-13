/**
 * 部署历史 API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const fs = require('fs');
const path = require('path');

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
  
  // 从本地物理日志文件异步或防阻塞读取详细日志
  const logFile = path.join(__dirname, `../data/logs/${req.params.id}.log`);
  try {
    if (fs.existsSync(logFile)) {
      const fileContent = fs.readFileSync(logFile, 'utf8');
      record.logs = fileContent.split('\n').filter(Boolean).map(line => {
        // 格式为: ISO_Time [type] text
        const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
        if (match) {
          return { time: new Date(match[1]).getTime(), type: match[2], text: match[3] };
        }
        return { time: Date.now(), type: 'info', text: line };
      });
    } else {
      record.logs = [];
    }
  } catch {
    record.logs = [];
  }
  res.json(record);
});

function deletePhysicalLogs(ids) {
  const idList = Array.isArray(ids) ? ids : [ids];
  for (const id of idList) {
    if (!id) continue;
    const logFile = path.join(__dirname, `../data/logs/${id}.log`);
    fs.unlink(logFile, () => {});
  }
}

// DELETE /api/history/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const result = db.prepare('DELETE FROM history WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });
  
  // 物理删除对应的日志文件
  deletePhysicalLogs(id);

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
  
  // 物理删除对应的日志文件
  deletePhysicalLogs(ids);

  const remaining = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  res.json({ success: true, deleted: result.changes, remaining });
});

// POST /api/history/cleanup
router.post('/cleanup', (req, res) => {
  const { keepDays = 30, keepPerProject = 5 } = req.body || {};
  const before = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. 获取并删除超期的失败记录及其物理日志
  const failedToDel = db.prepare("SELECT id FROM history WHERE status != 'success' AND timestamp < ?").all(cutoff).map(r => r.id);
  if (failedToDel.length > 0) {
    const ph = failedToDel.map(() => '?').join(',');
    db.prepare(`DELETE FROM history WHERE id IN (${ph})`).run(...failedToDel);
    deletePhysicalLogs(failedToDel);
  }

  // 2. 获取并删除每个项目超出保留上限的成功记录及其物理日志
  const projects = db.prepare("SELECT DISTINCT projectName FROM history WHERE status = 'success'").all();
  for (const { projectName } of projects) {
    const successToDel = db.prepare("SELECT id FROM history WHERE projectName = ? AND status = 'success' ORDER BY timestamp DESC LIMIT -1 OFFSET ?")
      .all(projectName, keepPerProject)
      .map(r => r.id);
    if (successToDel.length > 0) {
      const ph = successToDel.map(() => '?').join(',');
      db.prepare(`DELETE FROM history WHERE id IN (${ph})`).run(...successToDel);
      deletePhysicalLogs(successToDel);
    }
  }

  const after = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
  res.json({ success: true, before, after, deleted: before - after, strategy: `每项目保留 ${keepPerProject} 条成功 + ${keepDays} 天内失败记录` });
});

module.exports = router;
