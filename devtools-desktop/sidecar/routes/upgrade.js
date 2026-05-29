const express = require('express');
const router = express.Router();
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// 应用 Bundle 标识与安装路径（用于自动退出旧实例 + 拉起新实例）
const APP_BUNDLE_ID = 'com.devtools.desktop';
const APP_INSTALL_PATH = '/Applications/DevTools.app';
const APP_MACOS_DIR = `${APP_INSTALL_PATH}/Contents/MacOS/`;

/**
 * 生成并后台执行「重启守护脚本」。
 *
 * 该脚本完全脱离当前 Tauri 进程与 sidecar 进程的生命周期（nohup + 后台 + 孤儿进程），
 * 因此无论前端 IPC 是否可用、旧进程是否被回收，都能可靠地完成
 * 「优雅退出旧 App → 等待其完全退出 → 打开新 App」的闭环。
 *
 * @param {Function} broadcast 进度广播函数
 */
function scheduleAppRestart(broadcast) {
  // 旧应用主进程：sidecar 由 Tauri 主进程直接 spawn，故 ppid 即旧 App 主进程 PID
  const oldAppPid = process.ppid;
  const scriptPath = path.join(os.tmpdir(), `devtools-upgrade-restart-${Date.now()}.sh`);

  // 说明：
  //  1) 优先用 osascript 发送标准 Quit 事件（等价于用户手动 Cmd+Q，不会触发崩溃弹窗）
  //  2) 同时 kill -TERM 兜底；最多等待 6 秒确认旧进程退出
  //  3) 仍存活才 kill -KILL 强制结束（极端兜底）
  //  4) 旧进程确认退出后再 open 新程序，避开 macOS 单例路由与文件锁
  const scriptContent = `#!/bin/sh
# DevTools 自动更新重启守护脚本（执行后自删除）
sleep 1

# 1. 优雅退出旧实例（标准 Quit 事件，避免“异常退出”崩溃弹窗）
osascript -e 'tell application id "${APP_BUNDLE_ID}" to quit' >/dev/null 2>&1
kill -TERM ${oldAppPid} >/dev/null 2>&1

# 2. 最多等待 6 秒，确认旧主进程完全退出
i=0
while [ $i -lt 30 ]; do
  if ! kill -0 ${oldAppPid} >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
  i=$((i + 1))
done

# 3. 仍未退出则强制结束（极端兜底）
if kill -0 ${oldAppPid} >/dev/null 2>&1; then
  kill -KILL ${oldAppPid} >/dev/null 2>&1
fi
pkill -KILL -f "${APP_MACOS_DIR}" >/dev/null 2>&1

# 4. 旧实例已退出，拉起新安装的程序
sleep 0.5
open "${APP_INSTALL_PATH}"

# 5. 自清理
rm -f "${scriptPath}" >/dev/null 2>&1
`;

  try {
    fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  } catch (err) {
    broadcast('upgrade-progress', {
      event: 'Error',
      percent: 100,
      log: `\n❌ 生成重启守护脚本失败: ${err.message}\n请手动退出后重新打开应用。\n`,
    });
    return;
  }

  // 后台脱离执行：即便随后旧 App / sidecar 被回收，该脚本仍会继续完成重启
  exec(`nohup sh "${scriptPath}" >/dev/null 2>&1 &`, (err) => {
    if (err) console.error('[Upgrade] 启动重启守护进程失败:', err);
  });
}

/**
 * GET /api/upgrade/check
 * 检查更新接口（本地模式：永远返回 true，使按钮一直可用）
 */
router.get('/check', (req, res) => {
  res.json({
    hasUpdate: false,
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
      
      const homeDir = process.env.HOME || '/Users/ldy';
      const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        path.join(homeDir, '.cargo/bin'),
        path.dirname(process.execPath),
      ];

      const env = { ...process.env, ...options.env };
      const currentPath = env.PATH || '';
      env.PATH = [...extraPaths, ...currentPath.split(':')].filter((v, i, a) => v && a.indexOf(v) === i).join(':');

      const spawnOpts = { ...options, env };

      let child;
      try {
        child = spawn(cmd, args, spawnOpts);
      } catch (err) {
        reject(new Error(`启动子进程失败: ${err.message}`));
        return;
      }

      child.on('error', (err) => {
        reject(new Error(`进程执行错误: ${err.message}`));
      });
      
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
      await runStep('npm', ['run', 'build'], { cwd: PROJECT_ROOT }, 'Tauri 本地编译', 50);

      // Step 2: 覆盖替换 /Applications/ 下的程序 (静默安装)
      broadcast('upgrade-progress', { event: 'Progress', percent: 90, log: '\n=== [覆盖安装] 正在覆盖 /Applications 目录下的旧程序... ===\n' });
      
      const srcApp = path.join(PROJECT_ROOT, 'src-tauri/target/release/bundle/macos/DevTools.app');
      const destApp = '/Applications/DevTools.app';

      if (!fs.existsSync(srcApp)) {
        throw new Error(`未找到编译生成的应用安装包: ${srcApp}`);
      }

      // 执行删除并拷贝
      fs.rmSync(destApp, { recursive: true, force: true });
      fs.cpSync(srcApp, destApp, { recursive: true });
      broadcast('upgrade-progress', { event: 'Progress', percent: 95, log: '✔ 新版本应用文件覆盖成功！\n' });

      // Step 3: 重启应用并自我销毁
      broadcast('upgrade-progress', { event: 'Finished', percent: 100, log: '🎉 本地重新打包更新成功！应用即将自动退出并重启...\n' });

      // 由后台脱离进程负责「退出旧 App → 等待退出 → 打开新 App」，
      // 完全不依赖前端 IPC（exit_app），确保正式打包环境下也能可靠重启。
      scheduleAppRestart(broadcast);

    } catch (err) {
      broadcast('upgrade-progress', { event: 'Error', percent: 100, log: `\n❌ 重新打包更新失败: ${err.message}\n` });
    }
  })();
});

module.exports = router;
