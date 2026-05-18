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

const runJobs = new Map();

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

function buildRunEnv(nodeVersion, port) {
  const env = { ...process.env, FORCE_COLOR: '0' };
  if (port) {
    env.PORT = String(port);
    env.npm_config_port = String(port);
    env.VITE_PORT = String(port);
  }
  if (nodeVersion) {
    const nvmNodeBin = path.join(os.homedir(), '.nvm/versions/node', nodeVersion, 'bin');
    if (fs.existsSync(nvmNodeBin)) {
      env.PATH = `${nvmNodeBin}:${env.PATH}`;
    }
  }
  return env;
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
  const urlMatch = String(text).match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s)'"<]*/i);
  if (urlMatch) return urlMatch[0].replace('0.0.0.0', 'localhost');
  const portMatch = String(text).match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i);
  if (portMatch) return `http://localhost:${portMatch[1]}`;
  return fallbackPort ? `http://localhost:${fallbackPort}` : '';
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
  };
}

function pushLog(app, job, type, text) {
  const line = { type, text, time: Date.now() };
  job.logs.push(line);
  if (job.logs.length > 5000) job.logs.splice(0, job.logs.length - 4000);
  app.get('broadcast')('run-log', { id: job.id, projectName: job.projectName, type, text });
}

function broadcastStatus(app, job) {
  app.get('broadcast')('run-status', publicJob(job));
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
  if (url && !job.url) job.url = url;
  if (job.status === 'starting' && (url || /compiled|ready|started|listening|running|local:/i.test(text))) {
    job.status = 'running';
    broadcastStatus(app, job);
  }
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

function spawnRunProcess(app, job, project, launchCommand, env, moduleArgs) {
  job.status = 'starting';
  job.error = '';
  job.exitCode = null;
  job.stoppedAt = null;
  job.addressInUsePort = '';
  job.attempt = (job.attempt || 0) + 1;
  const attempt = job.attempt;

  const child = spawn(launchCommand, {
    cwd: project.path,
    shell: true,
    env,
    detached: true,
  });
  job.child = child;
  job.pid = child.pid;
  job.startedAt = Date.now();

  logRunStart(app, job, project, launchCommand, moduleArgs);

  child.stdout.on('data', (data) => {
    data.toString().split('\n').filter(line => line.trim()).forEach(line => {
      pushLog(app, job, 'info', line);
      markRunningFromOutput(app, job, line);
    });
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').filter(line => line.trim()).forEach(line => {
      const type = /warn/i.test(line) ? 'warn' : 'error';
      pushLog(app, job, type, line);
      markRunningFromOutput(app, job, line);
    });
  });

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    job.stoppedAt = Date.now();
    pushLog(app, job, 'error', `运行进程错误: ${err.message}`);
    broadcastStatus(app, job);
  });

  child.on('close', async (code, signal) => {
    if (attempt !== job.attempt) return;
    job.exitCode = code;
    job.stoppedAt = Date.now();

    if (job.status === 'stopping') {
      job.status = 'stopped';
      pushLog(app, job, 'warn', '已停止本地运行服务');
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
    }
    broadcastStatus(app, job);
  });

  setTimeout(() => {
    if (attempt === job.attempt && job.status === 'starting') {
      job.status = 'running';
      if (!job.url && job.port) job.url = `http://localhost:${job.port}`;
      pushLog(app, job, 'success', job.url ? `本地服务运行中: ${job.url}` : '本地服务已启动，等待开发服务器输出访问地址');
      broadcastStatus(app, job);
    }
  }, 1800);

  broadcastStatus(app, job);
}

router.get('/status', (req, res) => {
  res.json([...runJobs.values()].map(publicJob));
});

router.get('/:id/logs', (req, res) => {
  const job = runJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '运行任务不存在' });
  res.json({ ...publicJob(job), logs: job.logs });
});

router.post('/start', async (req, res) => {
  const { projectName, command, moduleName = '', moduleNames = [], includeHome = false, homeModuleNames = [], nodeVersion = '', port = '' } = req.body;
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
