/**
 * 应用通用设置（key/value）
 * 目前承载：服务器 SSH 连接超时（connTimeoutSec，默认 60s，范围 5–300s）
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

function readConnTimeoutSec() {
  const sec = parseInt(db.getSetting('connTimeoutSec', '60'), 10);
  return Number.isFinite(sec) ? Math.min(Math.max(sec, 5), 300) : 60;
}

// GET /api/settings — 读取应用设置
router.get('/', (req, res) => {
  try {
    res.json({ connTimeoutSec: readConnTimeoutSec() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings — 更新应用设置（白名单校验）
router.put('/', (req, res) => {
  try {
    if (req.body.connTimeoutSec !== undefined) {
      const sec = parseInt(req.body.connTimeoutSec, 10);
      if (!Number.isFinite(sec) || sec < 5 || sec > 300) {
        return res.status(400).json({ error: '连接超时需为 5–300 秒之间的整数' });
      }
      db.setSetting('connTimeoutSec', sec);
    }
    res.json({ connTimeoutSec: readConnTimeoutSec() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
