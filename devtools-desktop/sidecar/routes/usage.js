/**
 * Claude Code 用量统计 API
 * 查询接口会顺带触发一次节流同步（15s 内复用上次结果），保证数据基本实时
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const usage = require('../services/usage');

// GET /api/usage/summary?start=&end=  （unix 秒）
router.get('/summary', (req, res) => {
  try {
    usage.syncUsage();
    res.json(usage.getSummary(req.query.start, req.query.end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/trends?start=&end=&bucket=hour|day
router.get('/trends', (req, res) => {
  try {
    usage.syncUsage();
    const bucket = req.query.bucket === 'hour' ? 'hour' : 'day';
    res.json(usage.getTrends(req.query.start, req.query.end, bucket));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/models?start=&end=
router.get('/models', (req, res) => {
  try {
    usage.syncUsage();
    res.json(usage.getModelStats(req.query.start, req.query.end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/logs?start=&end=&model=&page=&pageSize=
router.get('/logs', (req, res) => {
  try {
    usage.syncUsage();
    res.json(usage.getLogs(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/pricing — 单价表
router.get('/pricing', (req, res) => {
  try {
    usage.ensurePricingSeed();
    res.json(db.prepare('SELECT * FROM model_pricing ORDER BY modelId').all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/usage/pricing/:modelId — 更新/新增单价，并全量重算历史成本
router.put('/pricing/:modelId', (req, res) => {
  try {
    const { displayName = '', inputPerM = 0, outputPerM = 0, cacheReadPerM = 0, cacheCreationPerM = 0 } = req.body || {};
    db.prepare(`
      INSERT INTO model_pricing (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(modelId) DO UPDATE SET displayName = excluded.displayName,
        inputPerM = excluded.inputPerM, outputPerM = excluded.outputPerM,
        cacheReadPerM = excluded.cacheReadPerM, cacheCreationPerM = excluded.cacheCreationPerM
    `).run(req.params.modelId, displayName, Number(inputPerM) || 0, Number(outputPerM) || 0,
           Number(cacheReadPerM) || 0, Number(cacheCreationPerM) || 0);
    res.json({ success: true, ...usage.repriceAll() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/usage/sync — 强制全量重扫
router.post('/sync', (req, res) => {
  try {
    res.json(usage.syncUsage(true));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/usage/import-ccswitch — 从 CC Switch 数据库一次性导入历史用量
router.post('/import-ccswitch', (req, res) => {
  try {
    res.json(usage.importFromCcSwitch());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
