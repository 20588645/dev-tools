const express = require('express');
const router = express.Router();
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * GET /api/upgrade/check
 * 检查更新接口（本地模式：永远返回 true，使按钮一直可用）
 */
router.get('/check', (req, res) => {
  res.json({
    hasUpdate: true,
    version: 'Local Source',
    commits: [
      '检测到本地开发源码。',
      '点击下方按钮将直接在本地重新编译最新代码，并静默覆盖安装至 /Applications/ 目录，完成后自动重启。'
    ]
  });
});

/**
 * POST /api/upgrade/start
 * 开始在后台执行本地重新编译与覆盖更新
 */
router.post('/start', (req, res) => {
  const broadcast = req.app.get('broadcast');
  res.json({ status: 'started' }); // 立即响应前端，防止 HTTP 挂起超时

  const runStep = (cmd, args, options, stepName, progressPercent) => {
    return new Promise((resolve, reject) => {
      broadcast('upgrade-progress', { event: 'Progress', percent: progressPercent, log: `\n=== [${stepName}] 正在执行: ${cmd} ${args.join(' ')} ===\n` });
      
      const child = spawn(cmd, args, options);
      
      child.stdout.on('data', (data) => {
        broadcast('upgrade-progress', { event: 'Progress', percent: progressPercent, log: data.toString() });
      });

      child.stderr.on('data', (data) => {
        broadcast('upgrade-progress', { event: 'Progress', percent: progressPercent, log: data.toString() });
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`[${stepName}] 执行失败，退出码: ${code}`));
        }
      });
    });
  };

  (async () => {
    try {
      broadcast('upgrade-progress', { event: 'Started', percent: 10, log: '🚀 开始执行本地一键热编译更新...\n' });

      // Step 1: Npm Build (调用 tauri build 编译本地当前代码)
      await runStep('npm', ['run', 'build'], { cwd: path.join(PROJECT_ROOT, 'devtools-desktop') }, 'Tauri 本地编译', 50);

      // Step 2: 覆盖替换 /Applications/ 下的程序 (静默安装)
      broadcast('upgrade-progress', { event: 'Progress', percent: 90, log: '\n=== [覆盖安装] 正在覆盖 /Applications 目录下的旧程序... ===\n' });
      
      const srcApp = path.join(PROJECT_ROOT, 'devtools-desktop/src-tauri/target/release/bundle/macos/DevTools.app');
      const destApp = '/Applications/DevTools.app';

      if (!fs.existsSync(srcApp)) {
        throw new Error(`未找到编译生成的应用安装包: ${srcApp}`);
      }

      // 执行删除并拷贝
      fs.rmSync(destApp, { recursive: true, force: true });
      fs.cpSync(srcApp, destApp, { recursive: true });
      broadcast('upgrade-progress', { event: 'Progress', percent: 95, log: '✔ 新版本应用文件覆盖成功！\n' });

      // Step 3: 重启应用并自我销毁
      broadcast('upgrade-progress', { event: 'Finished', percent: 100, log: '🎉 本地重新打包更新成功！应用将在 2 秒后自动重新启动...\n' });

      setTimeout(() => {
        // 使用 open 拉起新程序
        exec(`open "${destApp}"`, (err) => {
          if (err) console.error('重启程序失败:', err);
          // 强杀当前的旧程序进程（主进程和 Sidecar 会同步退出）
          exec('pkill -f DevTools');
        });
      }, 2000);

    } catch (err) {
      broadcast('upgrade-progress', { event: 'Error', percent: 100, log: `\n❌ 重新打包更新失败: ${err.message}\n` });
    }
  })();
});

module.exports = router;
