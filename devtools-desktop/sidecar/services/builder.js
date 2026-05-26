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

const { StringDecoder } = require('string_decoder');

/**
 * 流式字节/行处理器，防止中文字符包截断乱码及日志行撕裂
 */
function createLineProcessor(onLine) {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  return {
    write(chunk) {
      buffer += decoder.write(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        onLine(line);
      }
    },
    end() {
      const remaining = decoder.end();
      if (remaining) buffer += remaining;
      if (buffer.trim()) onLine(buffer);
      buffer = '';
    }
  };
}

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

    // 1. 获取当前分支名，安全无 shell 启动
    const branchChild = spawn('git', ['branch', '--show-current'], { cwd: projectPath });
    let branchName = '';
    const branchDecoder = new StringDecoder('utf8');
    
    branchChild.stdout.on('data', (d) => {
      branchName += branchDecoder.write(d);
    });
    
    branchChild.on('close', () => {
      branchName = branchName.trim();
      onLog('info', `📂 工作目录: ${projectPath}`);
      if (branchName) onLog('info', `🌿 当前分支: ${branchName}`);
      onLog('cmd', `$ git pull origin ${branchName || ''}`);
      onLog('info', '');

      // 2. 执行 git pull，安全无 shell 启动
      const child = spawn('git', ['pull'], { cwd: projectPath });
      
      const stdoutProcessor = createLineProcessor((line) => onLog('info', `  ${line}`));
      const stderrProcessor = createLineProcessor((line) => onLog('warn', `  ${line}`));

      child.stdout.on('data', (d) => stdoutProcessor.write(d));
      child.stderr.on('data', (d) => stderrProcessor.write(d));

      child.on('close', (code) => {
        stdoutProcessor.end();
        stderrProcessor.end();
        
        if (code !== 0) {
          onLog('warn', '⚠ git pull 失败（exit code: ' + code + '），继续构建');
          onLog('info', '');
          return resolve();
        }
        
        // 3. 显示当前最新提交，安全无 shell 启动
        const logChild = spawn('git', ['log', '-1', '--format=%h %s (%an, %ar)'], { cwd: projectPath });
        let commit = '';
        const commitDecoder = new StringDecoder('utf8');
        logChild.stdout.on('data', (d) => {
          commit += commitDecoder.write(d);
        });
        logChild.on('close', () => {
          commit = commit.trim();
          if (commit) onLog('info', `📌 最新提交: ${commit}`);
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
      // 获取分支名失败，直接执行 pull，安全无 shell 启动
      onLog('cmd', '$ git pull');
      const child = spawn('git', ['pull'], { cwd: projectPath });
      const stdoutProcessor = createLineProcessor((line) => onLog('info', `  ${line}`));
      const stderrProcessor = createLineProcessor((line) => onLog('warn', `  ${line}`));

      child.stdout.on('data', (d) => stdoutProcessor.write(d));
      child.stderr.on('data', (d) => stderrProcessor.write(d));
      
      child.on('close', () => {
        stdoutProcessor.end();
        stderrProcessor.end();
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
    const parts = buildCommand.trim().split(/\s+/);
    const cmd = parts[0];
    const args = [...parts.slice(1), ...modules].map(arg => {
      // 剥离首尾转义遗留的单双引号，还原真实参数
      if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
        return arg.slice(1, -1);
      }
      return arg;
    });

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

    // 当构建命令包含重定向或 Shell 连接符时采用 shell 模式，否则纯原生拉起，防范注入
    const useShell = /[\&\;\>\<\!\|\`]/g.test(buildCommand);
    const child = spawn(cmd, args, {
      cwd: projectPath,
      shell: useShell,
      env,
    });

    const stdoutProcessor = createLineProcessor((line) => onLog('info', line));
    const stderrProcessor = createLineProcessor((line) => {
      onLog(/warn/i.test(line) ? 'warn' : 'error', line);
    });

    child.stdout.on('data', (data) => stdoutProcessor.write(data));
    child.stderr.on('data', (data) => stderrProcessor.write(data));

    child.on('close', (code) => {
      stdoutProcessor.end();
      stderrProcessor.end();
      
      const duration = Date.now() - startTime;
      if (code === 0) {
        onLog('success', `\n✓ 构建完成 (${formatDuration(duration)})`);
        resolve({ success: true, duration, child });
      } else {
        onLog('error', `\n✗ 构建失败，退出码: ${code}`);
        resolve({ success: false, duration, child });
      }
    });

    child.on('error', (err) => {
      stdoutProcessor.end();
      stderrProcessor.end();
      
      const duration = Date.now() - startTime;
      onLog('error', `构建进程错误: ${err.message}`);
      resolve({ success: false, duration, child });
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
