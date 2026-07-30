/**
 * 2FA 账号管理 API
 */
const express = require('express');
const router = express.Router();
const twofa = require('../services/twofa');

router.get('/accounts', (req, res) => {
  try {
    res.json(twofa.readPublicAccounts(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/accounts/:id', (req, res) => {
  try {
    const row = twofa.getAccountRow(req.params.id);
    if (!row) return res.status(404).json({ error: '账号不存在' });
    res.json(twofa.summarizeRow(row, true));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/accounts', (req, res) => {
  try {
    const account = twofa.saveAccount(req.body || {});
    res.json({ success: true, account });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/accounts/:id', (req, res) => {
  try {
    const row = twofa.getAccountRow(req.params.id);
    if (!row) return res.status(404).json({ error: '账号不存在' });
    const account = twofa.saveAccount({ ...req.body, id: req.params.id }, row);
    res.json({ success: true, account });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/accounts/:id/touch', (req, res) => {
  try {
    res.json(twofa.touchAccount(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.delete('/accounts/:id', (req, res) => {
  try {
    res.json(twofa.deleteAccount(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// 说明：导出接口已按需求移除，避免把明文密钥落到磁盘文件。

// POST /api/twofa/preview — 只算一次验证码，不落库、不加密保存
// 用于「快捷查询」：临时查一个还没入库的密钥
router.post('/preview', (req, res) => {
  try {
    const body = req.body || {};
    // normalizeSecretInput 同时支持裸 Base32 与 otpauth:// 链接，并带出其中的参数
    const parsed = twofa.normalizeSecretInput(body.secret);
    if (!parsed.secret) return res.status(400).json({ error: '请输入有效的 Base32 密钥或 otpauth 链接' });
    // 请求显式指定的参数优先于链接里解析出的参数
    const algorithm = body.algorithm || parsed.algorithm;
    const period = body.period || parsed.period;
    const digits = body.digits || parsed.digits;
    const result = twofa.generateTotp(parsed.secret, { algorithm, period, digits });
    if (result.code.startsWith('---')) return res.status(400).json({ error: '密钥不是有效的 Base32 编码' });
    res.json({
      ...result,
      algorithm,
      period,
      digits,
      issuer: parsed.issuer,
      accountName: parsed.accountName,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/import', (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body?.accounts || []);
    res.json(twofa.importAccounts(items));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
