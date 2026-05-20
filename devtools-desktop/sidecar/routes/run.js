/**
 * 本地前端项目运行 API
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const PROJECTS_FILE = path.join(__dirname, '../data/projects.json');
const RUN_HISTORY_FILE = path.join(__dirname, '../data/run-history.json');

const runJobs = new Map();

// ========== Run History ==========
function readRunHistory() {
  try { return JSON.parse(fs.readFileSync(RUN_HISTORY_FILE, 'utf8')); } catch { return []; }
}

function writeRunHistory(history) {
  fs.writeFileSync(RUN_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function recordRunHistory(job) {
  const history = readRunHistory();
  history.unshift({
    id: job.id,
    projectName: job.projectName,
    moduleNames: job.moduleNames || [],
    command: job.command,
    nodeVersion: job.nodeVersion,
    port: job.port,
    url: job.url,
    status: job.status === 'stopped' ? 'success' : job.status,
    startedAt: job.startedAt,
    stoppedAt: job.stoppedAt,
    duration: job.stoppedAt && job.startedAt ? formatDuration(job.stoppedAt - job.startedAt) : '',
    exitCode: job.exitCode,
    error: job.error || '',
  });
  // 保留最近 100 条
  if (history.length > 100) history.length = 100;
  writeRunHistory(history);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeModuleNames(moduleNames, moduleName, includeHome, homeModuleNames = []) {
  const source = Array.isArray(moduleNames)
    ? moduleNames
    : (typeof moduleNames === 'string' && moduleNames ? moduleNames.split(',') : []);
  const homeModules = Array.isArray(homeModuleNames)
    ? homeModuleNames
    : (typeof homeModuleNames === 'string' && homeModuleNames ? homeModuleNames.split(',') : []);
  const normalized = source
    .concat(moduleName ? [moduleName] : [])
    .concat(includeHome ? homeModules : [])
    .map(v => String(v).trim())
    .filter(Boolean);

  const seen = new Set();
  return normalized.filter(v => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getNodeBinPath(nodeVersion) {
  if (!nodeVersion) return '';
  const nvmNodeBin = path.join(os.homedir(), '.nvm/versions/node', nodeVersion, 'bin');
  return fs.existsSync(nvmNodeBin) ? nvmNodeBin : '';
}

function buildRunEnv(nodeVersion, port) {
  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    TERM: 'dumb',
    COLUMNS: process.env.COLUMNS || '160',
    LINES: process.env.LINES || '40',
  };
  if (port) {
    env.PORT = String(port);
    env.npm_config_port = String(port);
    env.VITE_PORT = String(port);
  }
  const nvmNodeBin = getNodeBinPath(nodeVersion);
  if (nvmNodeBin) {
    env.PATH = `${nvmNodeBin}:${env.PATH || ''}`;
    env.NVM_BIN = nvmNodeBin;
    env.NVM_DIR = path.join(os.homedir(), '.nvm');
  }
  return env;
}

function stripTerminalControl(text) {
  return String(text || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x9B[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[@-_]/g, '')
    .replace(/\[[\d;]*m/g, '')
    .replace(/(^|\n)\s*(?:\d{1,2};)*\d{1,2}m/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+$/gm, '');
}

function firstPortMatch(text, patterns) {
  const value = String(text || '');
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function readProjectFile(projectPath, relativePath) {
  try {
    const file = path.join(projectPath, relativePath);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function inferProjectPort(project, command) {
  const commandPort = firstPortMatch(command, [
    /(?:^|\s)(?:PORT|VITE_PORT|npm_config_port)=(\d{2,5})(?:\s|$)/i,
    /(?:^|\s)--port(?:=|\s+)(\d{2,5})(?:\s|$)/i,
    /(?:^|\s)-p\s+(\d{2,5})(?:\s|$)/i,
  ]);
  if (commandPort) return commandPort;

  const vueConfig = readProjectFile(project.path, 'vue.config.js');
  const vuePort = firstPortMatch(vueConfig, [
    /devServer\s*:\s*{[\s\S]*?port\s*:\s*(?:Number\([^)]*\)|parseInt\([^)]*\)|['"]?)(\d{2,5})/i,
    /port\s*:\s*(?:Number\([^)]*\)|parseInt\([^)]*\)|['"]?)(\d{2,5})/i,
  ]);
  if (vuePort) return vuePort;

  const viteFiles = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'];
  for (const file of viteFiles) {
    const viteConfig = readProjectFile(project.path, file);
    const vitePort = firstPortMatch(viteConfig, [
      /server\s*:\s*{[\s\S]*?port\s*:\s*(?:Number\([^)]*\)|parseInt\([^)]*\)|['"]?)(\d{2,5})/i,
      /port\s*:\s*(?:Number\([^)]*\)|parseInt\([^)]*\)|['"]?)(\d{2,5})/i,
    ]);
    if (vitePort) return vitePort;
  }

  const vueCliConfig = readProjectFile(project.path, 'config/index.js');
  const vueCliPort = firstPortMatch(vueCliConfig, [
    /dev\s*:\s*{[\s\S]*?port\s*:\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?['"]?(\d{2,5})/i,
  ]);
  if (vueCliPort) return vueCliPort;

  const devServer = readProjectFile(project.path, 'build/dev-server.js');
  return firstPortMatch(devServer, [
    /(?:var|let|const)\s+port\s*=\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?['"]?(\d{2,5})/i,
    /listen\(\s*['"]?(\d{2,5})['"]?/i,
  ]);
}

function inferUrl(text, fallbackPort) {
  const value = String(text || '');
  if (/\[HPM\]|Proxy created|Proxy rewrite/i.test(value)) return '';
  const urlMatch = value.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s)'"<]*/i);
  if (urlMatch) return urlMatch[0].replace('0.0.0.0', 'localhost');
  const portMatch = value.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i);
  if (portMatch) return `http://localhost:${portMatch[1]}`;
  return '';
}

function detectAddressInUsePort(text) {
  const value = String(text || '');
  if (!/EADDRINUSE|address already in use/i.test(value)) return '';
  const match = value.match(/(?::|port:\s*)(\d{2,5})\b/i);
  return match ? match[1] : '';
}

function publicJob(job) {
  return {
    id: job.id,
    projectName: job.projectName,
    moduleName: job.moduleName,
    moduleNames: job.moduleNames,
    includeHome: job.includeHome,
    command: job.command,
    nodeVersion: job.nodeVersion,
    port: job.port,
    url: job.url,
    status: job.status,
    pid: job.pid,
    startedAt: job.startedAt,
    stoppedAt: job.stoppedAt,
    exitCode: job.exitCode,
    error: job.error,
    compileStatus: job.compileStatus || '',
    compileError: job.compileError || '',
    compileErrorAt: job.compileErrorAt || null,
    compileErrorSeq: job.compileErrorSeq || 0,
    autoRestart: job.autoRestart || false,
    autoRestartCount: job.autoRestartCount || 0,
    autoRestartMax: job.autoRestartMax || 3,
  };
}

function pushLog(app, job, type, text) {
  const cleanText = stripTerminalControl(text);
  if (!cleanText.trim()) return;
  const line = { type, text: cleanText, time: Date.now() };
  job.logs.push(line);
  if (job.logs.length > 5000) job.logs.splice(0, job.logs.length - 4000);
  app.get('broadcast')('run-log', { id: job.id, projectName: job.projectName, type, text: cleanText });
}

function broadcastStatus(app, job) {
  app.get('broadcast')('run-status', publicJob(job));
}

function markJobRunning(app, job, url = '') {
  const wasRunning = job.status === 'running';
  if (url && !job.url) job.url = url;
  if (wasRunning) {
    broadcastStatus(app, job);
    return;
  }

  job.status = 'running';
  const displayUrl = job.url || (job.port ? `http://localhost:${job.port}` : '');
  pushLog(app, job, 'success', displayUrl ? `✅ 本地服务运行成功: ${displayUrl}` : '✅ 本地服务运行成功');
  broadcastStatus(app, job);
}

function isRunReadyLine(text) {
  return /(?:compiled (?:successfully|with (?:\d+\s+)?warnings?)|compiled successfully|compiled with (?:\d+\s+)?warnings?|listening at|local:)/i.test(String(text || ''));
}

function isRunCompileStartLine(text) {
  return /(?:｢wdm｣:\s*)?compiling\.{2,}|wait until bundle finished|starting dev server/i.test(String(text || ''));
}

function isRunCompileErrorLine(text) {
  return /(?:failed to compile|module (?:build )?error|syntax error|typeerror:|referenceerror:|eslint-loader|npm err!|error in \.\/|^\s*error\s+in\s+|^\s*error\s{2,}|^\s*errors?:\s*$|^\s*[✖×]\s+\d+\s+problems?|^\s*[✘✖×]\s+.+|^\s*\^\s*$)/i.test(String(text || ''));
}

function addPendingReadyLine(job, line) {
  const clean = stripTerminalControl(line).trim();
  if (!clean) return;
  if (!job.pendingReadyLines) job.pendingReadyLines = [];
  if (!job.pendingReadyLines.includes(clean)) job.pendingReadyLines.push(clean);
}

function markCompileStarting(app, job) {
  if (job.compileStatus === 'compiling') return;
  job.compileStatus = 'compiling';
  job.compileErrorActive = false;
  job.compileError = '';
  broadcastStatus(app, job);
}

function markCompileError(app, job, line) {
  const clean = stripTerminalControl(line).trim();
  const alreadyInError = job.compileStatus === 'error' && job.compileErrorActive;
  job.compileStatus = 'error';
  job.compileErrorActive = true;
  if (!job.compileError) job.compileError = clean || '编译失败';
  if (!alreadyInError) {
    job.compileErrorAt = Date.now();
    job.compileErrorSeq = (job.compileErrorSeq || 0) + 1;
    broadcastStatus(app, job);
  }
}

function terminateJob(job, signal = 'SIGTERM') {
  if (!job || !job.pid) return;
  try {
    process.kill(-job.pid, signal);
  } catch {
    try { job.child?.kill(signal); } catch {}
  }
}

function cleanupRunJobs() {
  for (const job of runJobs.values()) {
    if (['starting', 'running', 'stopping'].includes(job.status)) {
      terminateJob(job, 'SIGTERM');
    }
  }
}

function markRunningFromOutput(app, job, text) {
  const busyPort = detectAddressInUsePort(text);
  if (busyPort) job.addressInUsePort = busyPort;

  const url = inferUrl(text, job.port);
  if (url) job.url = url;
}

function getPidsOnPort(port) {
  return new Promise((resolve) => {
    execFile('lsof', ['-ti', `tcp:${port}`], (err, stdout) => {
      if (err && !stdout) return resolve([]);
      const pids = String(stdout || '')
        .split(/\s+/)
        .map(pid => Number(pid))
        .filter(Boolean);
      resolve([...new Set(pids)]);
    });
  });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopProcessesOnPort(port, currentPid) {
  const pids = (await getPidsOnPort(port))
    .filter(pid => pid !== process.pid && pid !== currentPid);

  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }

  await new Promise(resolve => setTimeout(resolve, 900));

  for (const pid of pids) {
    if (isProcessAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }

  return pids;
}

async function ensurePortAvailable(app, job, port) {
  if (!port) return [];
  const pids = (await getPidsOnPort(port))
    .filter(pid => pid !== process.pid && pid !== job.pid);
  if (!pids.length) return [];

  pushLog(app, job, 'warn', `检测到端口 ${port} 已被旧服务占用，正在先停止旧服务...`);
  const stoppedPids = await stopProcessesOnPort(port, job.pid);
  if (stoppedPids.length) {
    pushLog(app, job, 'success', `已停止占用端口 ${port} 的旧进程: ${stoppedPids.join(', ')}`);
  }
  return stoppedPids;
}

function logRunStart(app, job, project, launchCommand, moduleArgs) {
  pushLog(app, job, 'info', '╔══════════════════════════════════════════╗');
  pushLog(app, job, 'info', `║        ▶ 本地运行任务启动${job.retryCount ? ' (重试)' : '       '}        ║`);
  pushLog(app, job, 'info', '╚══════════════════════════════════════════╝');
  pushLog(app, job, 'info', `📋 项目: ${project.displayName || job.projectName}`);
  if (moduleArgs.length) pushLog(app, job, 'info', `📦 模块: ${moduleArgs.join(', ')}`);
  pushLog(app, job, 'info', `🔧 Node: ${job.nodeVersion || '系统默认'}`);
  if (job.port) pushLog(app, job, 'info', `🌐 端口: ${job.port}`);
  pushLog(app, job, 'cmd', `$ ${launchCommand}`);
  pushLog(app, job, 'info', `📂 工作目录: ${project.path}`);
  pushLog(app, job, 'info', '');
}

function handleRunOutput(app, job, text, fallbackType = 'info') {
  job.outputBuffer = `${job.outputBuffer || ''}${stripTerminalControl(text)}`;
  const lines = job.outputBuffer.split('\n');
  job.outputBuffer = lines.pop() || '';
  lines.filter(line => line.trim()).forEach(line => processRunOutputLine(app, job, line, fallbackType));
  scheduleRunOutputFlush(app, job);
}

function flushRunOutput(app, job) {
  if (job.outputFlushTimer) {
    clearTimeout(job.outputFlushTimer);
    job.outputFlushTimer = null;
  }
  const text = (job.outputBuffer || '').trimEnd();
  job.outputBuffer = '';
  if (!text.trim()) return;
  text.split('\n').filter(line => line.trim()).forEach(line => processRunOutputLine(app, job, line, 'info'));
}

function scheduleRunOutputFlush(app, job) {
  if (!job.outputBuffer?.trim()) return;
  if (job.outputFlushTimer) clearTimeout(job.outputFlushTimer);
  job.outputFlushTimer = setTimeout(() => {
    flushRunOutput(app, job);
  }, 350);
}

function processRunOutputLine(app, job, line, fallbackType = 'info') {
  const clean = stripTerminalControl(line).trimEnd();
  if (!clean.trim()) return;

  const readyMatch = clean.match(/(?:[iℹ⚠]\s*)?｢wdm｣:\s*Compiled with (?:\d+\s+)?warnings?\.?|(?:[iℹ]\s*)?｢wdm｣:\s*Compiled successfully\.?|Compiled with (?:\d+\s+)?warnings?\.?|Compiled successfully\.?|>\s*Listening at\s+https?:\/\/[^\s]+|Listening at\s+https?:\/\/[^\s]+/i);
  if (readyMatch) {
    const before = clean.slice(0, readyMatch.index).trimEnd();
    if (before && !/^(?:warning|warn|success|info)$/i.test(before.trim())) processPlainRunOutputLine(app, job, before, fallbackType);
    addPendingReadyLine(job, readyMatch[0]);
    markRunningFromOutput(app, job, readyMatch[0]);
    scheduleRunReadyFlush(app, job);
    return;
  }

  processPlainRunOutputLine(app, job, clean, fallbackType);
}

function processPlainRunOutputLine(app, job, line, fallbackType = 'info') {
  markRunningFromOutput(app, job, line);
  if (isRunReadyLine(line)) {
    addPendingReadyLine(job, line);
    scheduleRunReadyFlush(app, job);
    return;
  }

  if (isRunCompileStartLine(line)) markCompileStarting(app, job);
  const isWarningLine = /(?:\bwarn(?:ing)?\b|deprecated|deprecation)/i.test(line);
  const isErrorLine = isRunCompileErrorLine(line) || (fallbackType === 'error' && !isWarningLine);
  if (isErrorLine) markCompileError(app, job, line);
  const type = isErrorLine
    ? 'error'
    : isWarningLine ? 'warn' : fallbackType;
  pushLog(app, job, type, line);
}

function scheduleRunReadyFlush(app, job) {
  if (job.readyFlushTimer) clearTimeout(job.readyFlushTimer);
  job.readyFlushTimer = setTimeout(() => flushRunReady(app, job), 1200);
}

function flushRunReady(app, job) {
  if (job.readyFlushTimer) {
    clearTimeout(job.readyFlushTimer);
    job.readyFlushTimer = null;
  }
  flushRunOutput(app, job);
  if (job.readyFlushTimer) {
    clearTimeout(job.readyFlushTimer);
    job.readyFlushTimer = null;
  }
  const readyLines = job.pendingReadyLines || [];
  job.pendingReadyLines = [];
  const displayUrl = job.url || (job.port ? `http://localhost:${job.port}` : '');
  if (readyLines.length && displayUrl && !readyLines.some(line => /listening at/i.test(line))) {
    readyLines.push(`> Listening at ${displayUrl}`);
  }
  readyLines.forEach(line => {
    const type = /warning/i.test(line) ? 'warn' : 'success';
    pushLog(app, job, type, line);
  });
  if (readyLines.length) {
    job.compileStatus = /warning/i.test(readyLines.join('\n')) ? 'warning' : 'success';
    job.compileErrorActive = false;
    job.compileError = '';
    job.compileErrorAt = null;
  }
  if (job.status === 'starting' && readyLines.length) {
    markJobRunning(app, job, displayUrl);
  } else if (job.status === 'running' && readyLines.length) {
    pushLog(app, job, 'success', displayUrl ? `✅ 本地服务运行成功: ${displayUrl}` : '✅ 本地服务运行成功');
    broadcastStatus(app, job);
  }
}

function spawnRunProcess(app, job, project, launchCommand, env, moduleArgs) {
  job.status = 'starting';
  job.error = '';
  job.exitCode = null;
  job.stoppedAt = null;
  job.addressInUsePort = '';
  job.attempt = (job.attempt || 0) + 1;
  const attempt = job.attempt;

  const nodeBin = getNodeBinPath(job.nodeVersion);
  const nodeEnvPrefix = nodeBin
    ? `export PATH=${shellQuote(nodeBin)}:$PATH\nexport NVM_BIN=${shellQuote(nodeBin)}\nexport NVM_DIR=${shellQuote(path.join(os.homedir(), '.nvm'))}\n`
    : '';
  const mergedCommand = `${nodeEnvPrefix}exec 2>&1\n${launchCommand}`;
  const child = spawn('/bin/bash', ['-c', mergedCommand], {
    cwd: project.path,
    env,
    detached: true,
  });
  job.child = child;
  job.pid = child.pid;
  job.startedAt = Date.now();

  logRunStart(app, job, project, launchCommand, moduleArgs);

  child.stdout.on('data', (data) => handleRunOutput(app, job, data.toString(), 'info'));
  child.stderr.on('data', (data) => handleRunOutput(app, job, data.toString(), 'error'));

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    job.stoppedAt = Date.now();
    pushLog(app, job, 'error', `运行进程错误: ${err.message}`);
    broadcastStatus(app, job);
  });

  child.on('close', async (code, signal) => {
    if (attempt !== job.attempt) return;
    flushRunOutput(app, job);
    flushRunReady(app, job);
    job.exitCode = code;
    job.stoppedAt = Date.now();

    if (job.status === 'stopping') {
      job.status = 'stopped';
      pushLog(app, job, 'warn', '已停止本地运行服务');
      recordRunHistory(job);
      broadcastStatus(app, job);
      return;
    }

    if (code !== 0 && job.addressInUsePort && !job.retriedAddressInUse) {
      const busyPort = job.addressInUsePort;
      job.retriedAddressInUse = true;
      job.retryCount = (job.retryCount || 0) + 1;
      pushLog(app, job, 'warn', `检测到端口 ${busyPort} 已被占用，正在停止旧本地服务...`);
      const stoppedPids = await stopProcessesOnPort(busyPort, job.pid);
      if (stoppedPids.length) {
        pushLog(app, job, 'success', `已停止占用端口 ${busyPort} 的旧进程: ${stoppedPids.join(', ')}`);
      } else {
        pushLog(app, job, 'warn', `未找到端口 ${busyPort} 的占用进程，仍将重新尝试启动`);
      }
      pushLog(app, job, 'info', '正在重新启动当前本地运行任务...');
      broadcastStatus(app, job);
      spawnRunProcess(app, job, project, launchCommand, env, moduleArgs);
      return;
    }

    if (code === 0) {
      job.status = 'stopped';
      pushLog(app, job, 'warn', '本地运行服务已退出');
    } else {
      job.status = 'error';
      job.error = signal ? `进程被信号终止: ${signal}` : `退出码: ${code}`;
      pushLog(app, job, 'error', `本地运行服务异常退出 (${job.error})`);

      // 自动重启逻辑
      if (job.autoRestart && (job.autoRestartCount || 0) < (job.autoRestartMax || 3)) {
        job.autoRestartCount = (job.autoRestartCount || 0) + 1;
        pushLog(app, job, 'warn', `自动重启 (${job.autoRestartCount}/${job.autoRestartMax || 3})...`);
        broadcastStatus(app, job);
        setTimeout(() => {
          job.retryCount = (job.retryCount || 0) + 1;
          spawnRunProcess(app, job, project, launchCommand, env, moduleArgs);
        }, 2000);
        return;
      }
    }
    // 记录运行历史
    recordRunHistory(job);
    broadcastStatus(app, job);
  });

  setTimeout(() => {
    if (attempt === job.attempt && job.status === 'starting') {
      pushLog(app, job, 'info', '本地服务进程已启动，正在等待开发服务器输出编译完成或访问地址...');
      broadcastStatus(app, job);
    }
  }, 1800);

  setTimeout(() => {
    if (attempt === job.attempt && job.status === 'starting') {
      markJobRunning(app, job, job.port ? `http://localhost:${job.port}` : '');
    }
  }, 120000);

  broadcastStatus(app, job);
}

router.get('/status', (req, res) => {
  res.json([...runJobs.values()].map(publicJob));
});

// ========== 运行历史 ==========
router.get('/history', (req, res) => {
  res.json(readRunHistory());
});

router.delete('/history/:id', (req, res) => {
  const history = readRunHistory();
  const filtered = history.filter(h => h.id !== req.params.id);
  writeRunHistory(filtered);
  res.json({ ok: true });
});

router.delete('/history', (req, res) => {
  writeRunHistory([]);
  res.json({ ok: true });
});

// ========== 批量启动/停止 ==========
router.post('/batch-stop', (req, res) => {
  const { projectNames } = req.body;
  if (!Array.isArray(projectNames) || projectNames.length === 0) {
    return res.status(400).json({ error: 'projectNames 必填' });
  }

  const stopped = [];
  for (const name of projectNames) {
    const job = [...runJobs.values()].find(j => j.projectName === name && ['starting', 'running'].includes(j.status));
    if (job) {
      job.status = 'stopping';
      pushLog(req.app, job, 'warn', '正在停止本地运行服务（批量操作）...');
      broadcastStatus(req.app, job);
      try {
        terminateJob(job, 'SIGTERM');
        setTimeout(() => {
          if (['starting', 'running', 'stopping'].includes(job.status)) {
            terminateJob(job, 'SIGKILL');
          }
        }, 2500);
      } catch {}
      stopped.push(name);
    }
  }
  res.json({ stopped });
});

// ========== 端口检测 ==========
router.get('/port-check/:port', async (req, res) => {
  const port = parseInt(req.params.port);
  if (!port || port < 1 || port > 65535) return res.status(400).json({ error: '无效端口号' });
  const pids = await getPidsOnPort(port);
  const inUse = pids.length > 0;
  res.json({ port, inUse, pids });
});

router.get('/:id/logs', (req, res) => {
  const job = runJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '运行任务不存在' });
  res.json({ ...publicJob(job), logs: job.logs });
});

router.post('/start', async (req, res) => {
  const { projectName, command, moduleName = '', moduleNames = [], includeHome = false, homeModuleNames = [], nodeVersion = '', port = '', autoRestart = false, autoRestartMax = 3 } = req.body;
  if (!projectName) return res.status(400).json({ error: 'projectName 必填' });

  const existing = [...runJobs.values()].find(job => job.projectName === projectName && ['starting', 'running'].includes(job.status));
  if (existing) return res.json(publicJob(existing));

  const projects = readJSON(PROJECTS_FILE);
  const project = projects.find(p => p.name === projectName);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const finalCommand = (command || project.runCommand || 'npm run dev').trim();
  if (!finalCommand) return res.status(400).json({ error: '启动命令不能为空' });

  const id = `run-${Date.now()}`;
  const moduleArgs = normalizeModuleNames(moduleNames, moduleName, includeHome, homeModuleNames);
  const launchCommand = moduleArgs.length ? `${finalCommand} ${moduleArgs.map(shellQuote).join(' ')}` : finalCommand;

  const job = {
    id,
    projectName,
    moduleName: moduleArgs[0] || '',
    moduleNames: moduleArgs,
    includeHome: !!includeHome,
    command: finalCommand,
    nodeVersion: nodeVersion || project.nodeVersion || '',
    port: port || inferProjectPort(project, finalCommand),
    url: '',
    status: 'starting',
    pid: null,
    startedAt: Date.now(),
    stoppedAt: null,
    exitCode: null,
    error: '',
    compileStatus: '',
    compileError: '',
    compileErrorAt: null,
    compileErrorSeq: 0,
    compileErrorActive: false,
    autoRestart: !!autoRestart,
    autoRestartMax: Math.min(parseInt(autoRestartMax) || 3, 10),
    autoRestartCount: 0,
    logs: [],
    child: null,
  };

  runJobs.set(id, job);
  const env = buildRunEnv(job.nodeVersion, job.port);
  await ensurePortAvailable(req.app, job, job.port);
  spawnRunProcess(req.app, job, project, launchCommand, env, moduleArgs);

  res.json(publicJob(job));
  broadcastStatus(req.app, job);
});

router.post('/:id/stop', (req, res) => {
  const job = runJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '运行任务不存在' });
  if (!['starting', 'running'].includes(job.status)) return res.json(publicJob(job));

  job.status = 'stopping';
  pushLog(req.app, job, 'warn', '正在停止本地运行服务...');
  broadcastStatus(req.app, job);

  try {
    terminateJob(job, 'SIGTERM');
    setTimeout(() => {
      if (['starting', 'running', 'stopping'].includes(job.status)) {
        terminateJob(job, 'SIGKILL');
      }
    }, 2500);
  } catch (err) {
    try { job.child?.kill('SIGTERM'); } catch {}
  }

  res.json(publicJob(job));
});

router.post('/:id/open', (req, res) => {
  const job = runJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '运行任务不存在' });
  const url = job.url || (job.port ? `http://localhost:${job.port}` : '');
  if (!url) return res.status(400).json({ error: '还没有可打开的本地地址' });

  execFile('open', [url], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, url });
  });
});

process.once('SIGTERM', cleanupRunJobs);
process.once('SIGINT', cleanupRunJobs);
process.once('exit', cleanupRunJobs);

module.exports = router;
