const express = require('express');
const router = express.Router();
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const LOCAL_PACKAGE_JSON = path.join(PROJECT_ROOT, 'devtools-desktop/package.json');

// 获取当前本地软件版本
function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(LOCAL_PACKAGE_JSON, 'utf8'));
    return pkg.version;
  } catch (e) {
    return '0.1.62';
  }
}

/**
 * GET /api/upgrade/check
 * 检查是否有新版本
 */
router.get('/check', async (req, res) => {
  try {
    // 拉取腾讯云服务器上的最新版本号
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const cloudRes = await fetch('http://111.231.69.255/upgrade/version.txt', { signal: controller.signal })
      .finally(() => clearTimeout(id));

    if (!cloudRes.ok) {
      return res.json({ hasUpdate: false, reason: '无法获取服务器版本' });
    }

    const cloudVersion = (await cloudRes.text()).trim();
    const localVersion = getLocalVersion();

    // 比较版本（简单字符串比较或 semver 比较）
    const hasUpdate = cloudVersion !== localVersion && cloudVersion > localVersion;

    res.json({
      hasUpdate,
      version: cloudVersion,
      commits: [
        `当前版本: v${localVersion}`,
        `腾讯云最新版本: v${cloudVersion}`,
        `更新说明: 合并自 Git 远端最新 release 分支。点击立即执行本地一键打包、覆盖安装并自动重启！`
      ]
    });
  } catch (err) {
    res.json({ hasUpdate: false, error: err.message });
  }
});

/**
 * POST /api/upgrade/start
 * 开始在后台执行本地打包与覆盖更新
 */
router.post('/start', (req, res) => {
  const broadcast = req.app.get('broadcast');
  res.json({ status: 'started' }); // 立即响应前端，防止 HTTP 请求挂起超时

  // 在后台异步启动执行流水线
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
      broadcast('upgrade-progress', { event: 'Started', percent: 5, log: '🚀 开始执行本地一键热替换编译...\n' });

      // Step 1: Git Pull
      await runStep('git', ['pull'], { cwd: PROJECT_ROOT }, 'Git Pull', 10);

      // Step 2: 安装前端依赖 (可选，通常极快)
      await runStep('npm', ['install'], { cwd: path.join(PROJECT_ROOT, 'devtools-desktop') }, 'Npm Install', 20);

      // Step 3: Npm Build (调用 tauri build)
      await runStep('npm', ['run', 'build'], { cwd: path.join(PROJECT_ROOT, 'devtools-desktop') }, 'Tauri Build', 40);

      // Step 4: 覆盖替换 /Applications/ 下的程序
      broadcast('upgrade-progress', { event: 'Progress', percent: 90, log: '\n=== [覆盖安装] 正在覆盖 /Applications 目录下的旧程序... ===\n' });
      
      const srcApp = path.join(PROJECT_ROOT, 'devtools-desktop/src-tauri/target/release/bundle/macos/DevTools.app');
      const destApp = '/Applications/DevTools.app';

      if (!fs.existsSync(srcApp)) {
        throw new Error(`未找到生成的应用安装包: ${srcApp}`);
      }

      // 执行删除并拷贝
      fs.rmSync(destApp, { recursive: true, force: true });
      fs.cpSync(srcApp, destApp, { recursive: true });
      broadcast('upgrade-progress', { event: 'Progress', percent: 95, log: '✔ 新版本应用文件覆盖成功！\n' });

      // Step 5: 重启应用并自我销毁
      broadcast('upgrade-progress', { event: 'Finished', percent: 100, log: '🎉 升级成功！应用将在 2 秒后自动重新启动...\n' });

      setTimeout(() => {
        // 使用 open 拉起新程序
        exec(`open "${destApp}"`, (err) => {
          if (err) console.error('重启程序失败:', err);
          // 强杀当前的旧程序进程（主进程和 Sidecar 会同步退出）
          exec('pkill -f DevTools');
        });
      }, 2000);

    } catch (err) {
      broadcast('upgrade-progress', { event: 'Error', percent: 100, log: `\n❌ 升级失败: ${err.message}\n` });
    }
  })();
});

module.exports = router;
