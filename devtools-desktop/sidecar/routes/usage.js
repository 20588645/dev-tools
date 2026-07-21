/**
 * Claude Code 用量统计 API
 * 查询接口会顺带触发一次节流同步（15s 内复用上次结果），保证数据基本实时
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const usage = require('../services/usage');
const pricing = require('../services/pricing');

// 应用筛选参数白名单
function appParam(req) {
  const app = String(req.query.app || '');
  return ['claude', 'codex'].includes(app) ? app : '';
}

// GET /api/usage/summary?start=&end=  （unix 秒）
router.get('/summary', (req, res) => {
  try {
    usage.syncUsage();
    res.json(usage.getSummary(req.query.start, req.query.end, appParam(req)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/trends?start=&end=&bucket=hour|day
router.get('/trends', (req, res) => {
  try {
    usage.syncUsage();
    const bucket = ['min10', 'hour', 'day'].includes(req.query.bucket) ? req.query.bucket : 'day';
    res.json(usage.getTrends(req.query.start, req.query.end, bucket, appParam(req)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/models?start=&end=
router.get('/models', (req, res) => {
  try {
    usage.syncUsage();
    res.json(usage.getModelStats(req.query.start, req.query.end, appParam(req)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/projects?start=&end=&app= — 项目维度聚合
router.get('/projects', (req, res) => {
  try {
    res.json(usage.getProjectStats(req.query.start, req.query.end, appParam(req)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage/top?start=&end=&app=&limit= — 最贵请求
router.get('/top', (req, res) => {
  try {
    res.json(usage.getTopRequests(req.query.start, req.query.end, appParam(req), req.query.limit));
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

// POST /api/usage/pricing/sync — 从公开目录抓取价格，只更新待确认候选
router.post('/pricing/sync', async (req, res) => {
  try {
    res.json(await pricing.syncPricing());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/usage/pricing/candidates — 查看上次同步的候选价格
router.get('/pricing/candidates', (req, res) => {
  try {
    const pendingOnly = req.query.pendingOnly !== 'false';
    res.json(pricing.getCandidates(pendingOnly));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/usage/pricing/candidates/:modelId/apply — 用户确认后应用候选并重算历史
router.post('/pricing/candidates/:modelId/apply', (req, res) => {
  try {
    const applied = pricing.applyCandidate(req.params.modelId);
    res.json({ success: true, pricing: applied, ...usage.repriceAll() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/usage/pricing/:modelId — 更新/新增单价，并全量重算历史成本
router.put('/pricing/:modelId', (req, res) => {
  try {
    const { displayName = '', inputPerM = 0, outputPerM = 0, cacheReadPerM = 0, cacheCreationPerM = 0 } = req.body || {};
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO model_pricing
        (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM,
         source, sourceUrl, provider, confidence, fetchedAt, pricingVersion, tiersJson)
      VALUES (?, ?, ?, ?, ?, ?, 'manual', '', '', 'manual', ?, ?, '[]')
      ON CONFLICT(modelId) DO UPDATE SET displayName = excluded.displayName,
        inputPerM = excluded.inputPerM, outputPerM = excluded.outputPerM,
        cacheReadPerM = excluded.cacheReadPerM, cacheCreationPerM = excluded.cacheCreationPerM,
        source = 'manual', sourceUrl = '', provider = '', confidence = 'manual',
        fetchedAt = excluded.fetchedAt, pricingVersion = excluded.pricingVersion, tiersJson = '[]'
    `).run(req.params.modelId, displayName, Number(inputPerM) || 0, Number(outputPerM) || 0,
           Number(cacheReadPerM) || 0, Number(cacheCreationPerM) || 0,
           now, `manual:${now}`);
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

// GET /api/usage/rate — 美元→人民币汇率（12h 缓存 + 离线兜底）
router.get('/rate', async (req, res) => {
  try {
    const r = await usage.getUsdCnyRate();
    res.json({ rate: r.rate, source: r.source, fetchedAt: r.at });
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
