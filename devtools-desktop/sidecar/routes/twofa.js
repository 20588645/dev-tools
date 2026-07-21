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

router.get('/export', (req, res) => {
  try {
    res.json({ accounts: twofa.exportAccounts(req.query) });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
