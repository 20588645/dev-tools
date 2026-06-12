/**
 * 数据库备份管理 API
 * 恢复为"暂存 + 重启换库"两段式：restore 仅落暂存文件，重启后端后由
 * database.js 在开库前完成换库，所以恢复接口返回后需提示用户重启后端
 */
const express = require('express');
const router = express.Router();
const backup = require('../services/backup');

// GET /api/backup/list — 备份列表与恢复暂存状态
router.get('/list', (req, res) => {
  try {
    res.json({ backups: backup.listBackups(), pendingRestore: backup.hasPendingRestore() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/create — 立即备份
router.post('/create', async (req, res) => {
  try {
    res.json(await backup.createBackup('manual'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/restore — 暂存恢复（重启后端生效）
router.post('/restore', (req, res) => {
  try {
    const { file } = req.body || {};
    if (!file) return res.status(400).json({ error: '缺少 file 参数' });
    res.json(backup.stageRestore(file));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/restore-cancel — 取消未生效的恢复暂存
router.post('/restore-cancel', (req, res) => {
  try {
    res.json(backup.cancelRestore());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/backup/:file — 删除指定备份
router.delete('/:file', (req, res) => {
  try {
    res.json(backup.deleteBackup(req.params.file));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
