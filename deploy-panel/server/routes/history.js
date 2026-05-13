/**
 * 部署历史 API
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/history.json');

function readHistory() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeHistory(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/history — 历史列表
router.get('/', (req, res) => {
  const history = readHistory();
  // 返回列表时不包含完整日志（减少传输量）
  const list = history.map(({ logs, ...rest }) => rest);
  res.json(list);
});

// GET /api/history/:id — 某次部署的详细日志
router.get('/:id', (req, res) => {
  const history = readHistory();
  const record = history.find(h => h.id === req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  res.json(record);
});

// DELETE /api/history/:id — 删除单条记录
router.delete('/:id', (req, res) => {
  const history = readHistory();
  const idx = history.findIndex(h => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '记录不存在' });
  history.splice(idx, 1);
  writeHistory(history);
  res.json({ success: true, remaining: history.length });
});

// DELETE /api/history — 批量删除 (body: { ids: string[] })
router.delete('/', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids 必须是非空数组' });
  }
  let history = readHistory();
  const before = history.length;
  const idsSet = new Set(ids);
  history = history.filter(h => !idsSet.has(h.id));
  writeHistory(history);
  res.json({ success: true, deleted: before - history.length, remaining: history.length });
});

// POST /api/history/cleanup — 自动整理
// 策略: 每个项目保留最近 keepPerProject 条成功记录 + 保留 keepDays 天内的失败记录
router.post('/cleanup', (req, res) => {
  const { keepDays = 30, keepPerProject = 5 } = req.body || {};
  const history = readHistory();
  const before = history.length;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

  // 每个项目的成功记录计数器
  const projectSuccessCounters = {};
  const result = [];

  for (const h of history) {
    const key = h.projectName;
    if (h.status === 'success') {
      // 成功记录：每个项目只保留最近 keepPerProject 条
      if (!projectSuccessCounters[key]) projectSuccessCounters[key] = 0;
      if (projectSuccessCounters[key] < keepPerProject) {
        result.push(h);
        projectSuccessCounters[key]++;
      }
    } else {
      // 失败记录：只保留 keepDays 天内的
      if (new Date(h.timestamp).getTime() >= cutoff) {
        result.push(h);
      }
    }
  }

  writeHistory(result);

  res.json({
    success: true,
    before,
    after: result.length,
    deleted: before - result.length,
    strategy: `每项目保留 ${keepPerProject} 条成功 + ${keepDays} 天内失败记录`,
  });
});

module.exports = router;
