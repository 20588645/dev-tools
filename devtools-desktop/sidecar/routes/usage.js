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
  return ['claude', 'codex', 'cursor'].includes(app) ? app : '';
}

async function withLocalSync(req, res, write) {
  try {
    usage.syncUsage();
    await usage.syncCursorUsage();
    write(req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// GET /api/usage/summary?start=&end=  （unix 秒）
router.get('/summary', (req, res) => withLocalSync(req, res, () => {
  res.json(usage.getSummary(req.query.start, req.query.end, appParam(req)));
}));

// GET /api/usage/trends?start=&end=&bucket=hour|day
router.get('/trends', (req, res) => withLocalSync(req, res, () => {
  const bucket = ['min10', 'hour', 'day'].includes(req.query.bucket) ? req.query.bucket : 'day';
  res.json(usage.getTrends(req.query.start, req.query.end, bucket, appParam(req)));
}));

// GET /api/usage/models?start=&end=
router.get('/models', (req, res) => withLocalSync(req, res, () => {
  res.json(usage.getModelStats(req.query.start, req.query.end, appParam(req)));
}));

// GET /api/usage/projects?start=&end=&app= — 项目维度聚合
router.get('/projects', (req, res) => withLocalSync(req, res, () => {
  res.json(usage.getProjectStats(req.query.start, req.query.end, appParam(req)));
}));

// GET /api/usage/top?start=&end=&app=&limit=&sort=cost|tokens
router.get('/top', (req, res) => withLocalSync(req, res, () => {
  res.json(usage.getTopRequests(req.query.start, req.query.end, appParam(req), req.query.limit, req.query.sort));
}));

// GET /api/usage/logs?start=&end=&model=&page=&pageSize=
router.get('/logs', (req, res) => withLocalSync(req, res, () => {
  res.json(usage.getLogs({ ...req.query, app: appParam(req) }));
}));

// GET /api/usage/pricing — 单价表
router.get('/pricing', (req, res) => {
  try {
    usage.ensurePricingSeed();
    res.json(db.prepare('SELECT * FROM model_pricing ORDER BY modelId').all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/usage/pricing/sync — 从公开目录抓取价格并批量覆盖可靠匹配项
router.post('/pricing/sync', async (req, res) => {
  try {
    const result = await pricing.syncPricing();
    const repricing = result.applied > 0 ? usage.repriceAll() : { repriced: 0 };
    res.json({ ...result, ...repricing });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 说明：原「查看候选价格 / 逐条应用候选」两个接口已随旧 Usage 页面下线。
// 现在同步会直接覆盖可靠匹配项，pricing_candidates 表仅作为最近一次同步的诊断记录写入。

// PUT /api/usage/pricing/:modelId — 更新/新增单价，并全量重算历史成本
router.put('/pricing/:modelId', (req, res) => {
  try {
    const { displayName = '', inputPerM = 0, outputPerM = 0, cacheReadPerM = 0, cacheCreationPerM = 0 } = req.body || {};
    const values = [inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ error: '模型单价必须是大于或等于 0 的有效数字' });
    }
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
    `).run(req.params.modelId, displayName, ...values,
           now, `manual:${now}`);
    res.json({ success: true, ...usage.repriceAll() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/usage/sync — 强制全量重扫（含 Cursor 官方用量）
router.post('/sync', async (req, res) => {
  try {
    const local = usage.syncUsage(true);
    const cursor = await usage.syncCursorUsage(true);
    res.json({
      ...local,
      cursorUpserted: cursor.upserted || 0,
      cursorError: cursor.cursorError || '',
    });
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
