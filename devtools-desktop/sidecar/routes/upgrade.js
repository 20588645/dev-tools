/**
 * 升级路由 — 执行重新打包并重启
 */
const { Router } = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = Router();

const PROJECT_DIR = path.resolve(__dirname, '../../');
const SCRIPT_PATH = path.join(PROJECT_DIR, 'scripts/rebuild-and-restart.sh');
const LOG_FILE = path.join(PROJECT_DIR, 'scripts/rebuild.log');

// 升级状态
let upgradeInProgress = false;

/**
 * POST /api/upgrade/start
 * 触发重新打包并重启流程
 */
router.post('/start', (req, res) => {
  if (upgradeInProgress) {
    return res.status(409).json({ error: '升级正在进行中，请勿重复操作' });
  }

  upgradeInProgress = true;

  // 清空旧日志
  try { fs.writeFileSync(LOG_FILE, ''); } catch (e) {}

  try {
    // 使用 nohup 启动独立脚本，使其不随 sidecar 进程退出而终止
    const child = spawn('nohup', ['bash', SCRIPT_PATH], {
      detached: true,
      stdio: 'ignore',
      cwd: PROJECT_DIR,
    });
    
    child.on('error', (err) => {
      console.error('[Upgrade] 子进程启动错误 event:', err);
    });

    child.unref();
  } catch (err) {
    console.error('[Upgrade] 启动子进程失败:', err);
    upgradeInProgress = false;
    return res.status(500).json({ error: `启动更新脚本失败: ${err.message}` });
  }

  res.json({ success: true, message: '升级已启动，应用将在打包完成后自动重启' });
});

/**
 * GET /api/upgrade/status
 * 获取升级日志（前端轮询用）
 */
router.get('/status', (req, res) => {
  try {
    const log = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf-8') : '';
    const completed = log.includes('========== 完成');
    const failed = log.includes('[ERROR]');
    res.json({ inProgress: upgradeInProgress, log, completed, failed });
  } catch (e) {
    res.json({ inProgress: upgradeInProgress, log: '', completed: false, failed: false });
  }
});

/**
 * GET /api/upgrade/check
 * 检查是否有新的 git 提交可用
 */
router.get('/check', async (req, res) => {
  try {
    const gitDir = path.resolve(PROJECT_DIR, '..');
    exec('git fetch origin dev && git log HEAD..origin/dev --oneline', { cwd: gitDir }, (err, stdout) => {
      if (err) return res.json({ hasUpdate: false, commits: [] });
      const lines = stdout.trim().split('\n').filter(Boolean);
      res.json({ hasUpdate: lines.length > 0, commits: lines });
    });
  } catch (e) {
    res.json({ hasUpdate: false, commits: [] });
  }
});

module.exports = router;
