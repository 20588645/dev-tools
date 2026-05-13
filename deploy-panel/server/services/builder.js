/**
 * 构建引擎
 * 支持指定 Node 版本（通过 nvm 路径切换）执行 npm run build
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * 执行构建
 * @param {Object} options
 * @param {string} options.projectPath - 项目绝对路径
 * @param {string} options.buildCommand - 构建命令 (如 'npm run build')
 * @param {string[]} options.modules - 模块名列表（多模块项目）
 * @param {string} options.nodeVersion - 指定 Node 版本（如 'v18.20.4'），空字符串使用系统默认
 * @param {Function} options.onLog - 日志回调 (type, text)
 * @returns {Promise<{success: boolean, duration: number}>}
 */

/**
 * 构建前自动拉取最新代码
 * git pull 失败不阻断构建，仅 warn 提示
 */
function gitPull(projectPath, onLog) {
  return new Promise((resolve) => {
    // 检查是否是 git 仓库
    if (!fs.existsSync(path.join(projectPath, '.git'))) {
      onLog('info', '⚠ 非 Git 仓库，跳过 git pull');
      onLog('info', '');
      return resolve();
    }

    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    onLog('info', '📥 阶段一：拉取最新代码');
    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 先获取当前分支名
    const branchChild = spawn('git', ['branch', '--show-current'], { cwd: projectPath, shell: true });
    let branchName = '';
    branchChild.stdout.on('data', (d) => { branchName = d.toString().trim(); });
    branchChild.on('close', () => {
      onLog('info', `📂 工作目录: ${projectPath}`);
      if (branchName) onLog('info', `🌿 当前分支: ${branchName}`);
      onLog('cmd', `$ git pull origin ${branchName || ''}`);
      onLog('info', '');

      const child = spawn('git', ['pull'], { cwd: projectPath, shell: true });
      let output = '';

      child.stdout.on('data', (d) => {
        const text = d.toString();
        output += text;
        text.split('\n').filter(l => l.trim()).forEach(l => onLog('info', `  ${l}`));
      });
      child.stderr.on('data', (d) => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => onLog('warn', `  ${l}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          onLog('warn', '⚠ git pull 失败（exit code: ' + code + '），继续构建');
          onLog('info', '');
          return resolve();
        }
        // 显示当前最新提交
        const logChild = spawn('git', ['log', '-1', '--format=%h %s (%an, %ar)'], { cwd: projectPath, shell: true });
        logChild.stdout.on('data', (d) => {
          const commit = d.toString().trim();
          if (commit) onLog('info', `📌 最新提交: ${commit}`);
        });
        logChild.on('close', () => {
          onLog('info', '✅ 代码拉取完成');
          onLog('info', '');
          resolve();
        });
        logChild.on('error', () => resolve());
      });
      child.on('error', () => {
        onLog('warn', '⚠ git pull 执行失败，继续构建');
        onLog('info', '');
        resolve();
      });
    });
    branchChild.on('error', () => {
      // 获取分支名失败，直接执行 pull
      onLog('cmd', '$ git pull');
      const child = spawn('git', ['pull'], { cwd: projectPath, shell: true });
      child.stdout.on('data', (d) => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => onLog('info', `  ${l}`));
      });
      child.stderr.on('data', (d) => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => onLog('warn', `  ${l}`));
      });
      child.on('close', () => {
        onLog('info', '');
        resolve();
      });
      child.on('error', () => resolve());
    });
  });
}

async function build({ projectPath, buildCommand, modules = [], nodeVersion = '', onLog, onPhase }) {
  const startTime = Date.now();

  // Phase 0: 自动拉取最新代码
  await gitPull(projectPath, onLog);
  // 通知前端：git pull 完成，进入构建阶段
  if (onPhase) onPhase('building');

  return new Promise((resolve) => {
    const parts = buildCommand.split(' ');
    const cmd = parts[0];
    const args = [...parts.slice(1), ...modules];

    // 构建环境变量，支持 Node 版本切换
    const env = { ...process.env, FORCE_COLOR: '0' };

    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    onLog('info', '🔨 阶段二：执行构建');
    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (nodeVersion) {
      const nvmNodeBin = path.join(os.homedir(), '.nvm/versions/node', nodeVersion, 'bin');
      if (fs.existsSync(nvmNodeBin)) {
        // 将指定版本的 bin 目录放到 PATH 最前面，覆盖系统默认 Node
        env.PATH = `${nvmNodeBin}:${env.PATH}`;
        onLog('info', `🔧 Node 版本: ${nodeVersion}`);
        onLog('info', `   路径: ${nvmNodeBin}`);
      } else {
        onLog('warn', `⚠ Node ${nodeVersion} 未找到，使用系统默认版本`);
      }
    }

    onLog('cmd', `$ ${buildCommand}${modules.length ? ' ' + modules.join(' ') : ''}`);
    onLog('info', `📂 工作目录: ${projectPath}`);
    onLog('info', '');

    const child = spawn(cmd, args, {
      cwd: projectPath,
      shell: true,
      env,
    });

    child.stdout.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => onLog('info', line));
    });

    child.stderr.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => {
        onLog(/warn/i.test(line) ? 'warn' : 'error', line);
      });
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        onLog('success', `\n✓ 构建完成 (${formatDuration(duration)})`);
        resolve({ success: true, duration });
      } else {
        onLog('error', `\n✗ 构建失败，退出码: ${code}`);
        resolve({ success: false, duration });
      }
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      onLog('error', `构建进程错误: ${err.message}`);
      resolve({ success: false, duration });
    });
  });
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

module.exports = { build, formatDuration };
