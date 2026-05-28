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
 * 检查是否有新的 git 提交可用（对比远程 release 分支最新 commit 与本地最后一次成功打包的 commit）
 */
router.get('/check', async (req, res) => {
  try {
    const gitDir = path.resolve(PROJECT_DIR, '..');
    exec('git fetch origin release && git rev-parse origin/release', { cwd: gitDir }, (err, stdout) => {
      if (err) return res.json({ hasUpdate: false, commits: [] });
      const remoteHash = stdout.trim();

      const hashFile = path.join(PROJECT_DIR, 'scripts/last-build-commit.txt');
      let localHash = '';
      if (fs.existsSync(hashFile)) {
        localHash = fs.readFileSync(hashFile, 'utf-8').trim();
      } else {
        // 如果文件不存在，先获取当前 HEAD commit 并写入，做为初始对齐
        try {
          exec('git rev-parse HEAD', { cwd: gitDir }, (err2, stdout2) => {
            if (!err2) {
              localHash = stdout2.trim();
              fs.writeFileSync(hashFile, localHash, 'utf-8');
            }
          });
        } catch (e) {}
      }

      // 如果未读到本地 hash，降级使用 HEAD..origin/release 的对比
      if (!localHash) {
        exec('git log HEAD..origin/release --oneline', { cwd: gitDir }, (errLog, stdoutLog) => {
          if (errLog) return res.json({ hasUpdate: false, commits: [] });
          const lines = stdoutLog.trim().split('\n').filter(Boolean);
          return res.json({ hasUpdate: lines.length > 0, commits: lines });
        });
        return;
      }

      // 对比哈希
      if (remoteHash && localHash && remoteHash !== localHash) {
        exec(`git log ${localHash}..${remoteHash} --oneline`, { cwd: gitDir }, (errLog, stdoutLog) => {
          const lines = errLog ? [] : stdoutLog.trim().split('\n').filter(Boolean);
          res.json({ hasUpdate: true, commits: lines });
        });
      } else {
        res.json({ hasUpdate: false, commits: [] });
      }
    });
  } catch (e) {
    res.json({ hasUpdate: false, commits: [] });
  }
});

module.exports = router;
