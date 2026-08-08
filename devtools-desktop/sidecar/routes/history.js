/**
 * 部署历史 API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const fs = require('fs');
const path = require('path');

// 物理日志目录必须跟随测试沙箱切换，与 database.js / backup.js 同一判据。
// 此前硬编码 '../data/logs'，测试模式会读写并删除正式库的日志文件。
const IS_TEST = process.env.DEVTOOLS_TEST === '1' || process.argv.includes('--test');
const LOGS_DIR = path.join(__dirname, '..', IS_TEST ? 'data-test' : 'data', 'logs');

// GET /api/history — 历史列表（不含 logs）
router.get('/', (req, res) => {
  try {
    const history = db.prepare('SELECT id, projectName, type, status, modules, serverName, nodeVersion, remotePath, duration, timestamp FROM history ORDER BY timestamp DESC').all();
    res.json(history.map(h => ({ ...h, modules: JSON.parse(h.modules || '[]') })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/history/:id — 某条记录（含 logs）
router.get('/:id', (req, res) => {
  try {
    const record = db.prepare('SELECT * FROM history WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    record.modules = JSON.parse(record.modules || '[]');

    // 从本地物理日志文件异步或防阻塞读取详细日志
    const logFile = path.join(LOGS_DIR, `${req.params.id}.log`);
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function deletePhysicalLogs(ids) {
  const idList = Array.isArray(ids) ? ids : [ids];
  for (const id of idList) {
    if (!id) continue;
    const logFile = path.join(LOGS_DIR, `${id}.log`);
    fs.unlink(logFile, () => {});
  }
}

// DELETE /api/history/:id
router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const result = db.prepare('DELETE FROM history WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });

    // 物理删除对应的日志文件
    deletePhysicalLogs(id);

    const remaining = db.prepare('SELECT COUNT(*) as count FROM history').get().count;
    res.json({ success: true, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/history — 批量删除
router.delete('/', (req, res) => {
  try {
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/history/cleanup
router.post('/cleanup', (req, res) => {
  try {
    // 入参范围 clamp：keepDays/keepPerProject 直接参与 cutoff 计算与 SQL OFFSET，
    // 负数/NaN 会误删全部（cutoff 落到未来 → 删光失败记录；OFFSET<=0 → 删光成功记录），
    // 必须钳制到合理区间后再用
    const rawDays = parseInt(req.body?.keepDays, 10);
    const rawPer = parseInt(req.body?.keepPerProject, 10);
    const keepDays = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 3650) : 30;
    const keepPerProject = Number.isFinite(rawPer) ? Math.min(Math.max(rawPer, 1), 1000) : 5;

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
