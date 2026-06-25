/**
 * 构建 & 部署 API
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { build, formatDuration } = require('../services/builder');
const { deploy } = require('../services/deployer');
const { decrypt } = require('../services/crypto');
const { Client } = require('ssh2');
const db = require('../services/database');

const LOGS_DIR = path.join(__dirname, '../data/logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * 预检：验证服务器 SSH 连通性 + 远程目录可访问性
 * 成功时保持连接不关闭，返回 conn 供后续部署复用
 * @returns {Promise<{success: boolean, conn?: Client, error?: string}>}
 */
function preflightCheck(serverConfig, remotePath) {
  return new Promise((resolve) => {
    const conn = new Client();
    let done = false;
    const fail = (result) => { if (done) return; done = true; conn.end(); resolve(result); };

    const timer = setTimeout(() => {
      fail({ success: false, error: '连接超时 (60s)' });
    }, 60000);

    conn.on('ready', () => {
      // SSH 连通，继续检查远程目录
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timer);
          return fail({ success: false, error: `SFTP 初始化失败: ${err.message}` });
        }
        sftp.stat(remotePath, (statErr) => {
          clearTimeout(timer);
          if (statErr) {
            return fail({ success: false, error: `远程目录不可访问: ${remotePath} (${statErr.message})` });
          }
          // 成功：保持连接，返回 conn 供后续复用
          if (done) return;
          done = true;
          resolve({ success: true, conn });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      fail({ success: false, error: `SSH 连接失败: ${err.message}` });
    });

    const decryptedPwd = serverConfig.password ? decrypt(serverConfig.password) : '';

    conn.connect({
      host: serverConfig.host,
      port: serverConfig.port,
      username: serverConfig.username,
      password: decryptedPwd,
      tryKeyboard: true,
      readyTimeout: 60000,
      authHandler: (() => {
        let attempts = 0;
        return (methodsLeft, partialSuccess, callback) => {
          if (methodsLeft === null) { attempts = 0; return callback('password'); }
          attempts++;
          if (attempts > 2) return callback(false);
          if (methodsLeft.includes('password')) return callback('password');
          if (methodsLeft.includes('keyboard-interactive')) return callback('keyboard-interactive');
          callback(false);
        };
      })(),
    });

    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      finish([decryptedPwd]);
    });
  });
}

const PROJECTS_FILE = path.join(__dirname, '../data/projects.json');
const SERVERS_FILE = path.join(__dirname, '../data/servers.json');

function readJSON(file) {
  if (file.includes('projects.json')) {
    try {
      const rows = db.prepare('SELECT data FROM projects_json').all();
      return rows.map(r => JSON.parse(r.data));
    } catch (e) {
      console.error('[DB] 读取 projects_json 失败:', e.message);
      return [];
    }
  }
  if (file.includes('servers.json')) {
    try {
      const rows = db.prepare('SELECT * FROM servers').all();
      return rows.map(r => ({
        ...r,
        password: r.password ? JSON.parse(r.password) : null,
        deployPaths: JSON.parse(r.deployPaths || '[]'),
        port: Number(r.port),
      }));
    } catch (e) {
      console.error('[DB] 读取 servers 失败:', e.message);
      return [];
    }
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function appendHistory(record) {
  try {
    db.prepare(`
      INSERT INTO history (id, projectName, type, status, modules, serverName, nodeVersion, remotePath, duration, timestamp, logs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectName,
      record.type,
      record.status,
      JSON.stringify(record.modules),
      record.serverName || '—',
      record.nodeVersion || '系统默认',
      record.remotePath || '—',
      record.duration || '0s',
      record.timestamp || new Date().toISOString(),
      '' // logs字段填空，真正大日志物理文件已在每一次onLog时实时追加写盘了
    );
  } catch (err) {
    console.error('[DB] 写入 history 失败:', err.message);
  }
}

// ========== 活跃任务注册表（内存中，进程级） ==========
// 解决页面刷新后无法恢复正在执行的任务日志的问题
const activeJobs = new Map();

function registerJob(id, meta) {
  activeJobs.set(id, {
    id,
    projectName: meta.projectName,
    type: meta.type,       // 'build' | 'deploy'
    phase: 'pulling',
    startTime: Date.now(),
    logs: [],              // 累积所有日志，刷新后可回放
    modules: meta.modules || [],
    serverName: meta.serverName || '—',
  });
}

function jobLog(id, type, text) {
  const job = activeJobs.get(id);
  if (job) {
    // 日志上限保护：最多保留 5000 条，防止内存溢出
    if (job.logs.length >= 5000) {
      job.logs.splice(0, job.logs.length - 4000);
    }
    job.logs.push({ type, text, time: Date.now() });
  }
}

function jobPhase(id, phase) {
  const job = activeJobs.get(id);
  if (job) job.phase = phase;
}

function unregisterJob(id) {
  activeJobs.delete(id);
}

// GET /api/deploy/active — 获取当前活跃任务（刷新恢复用）
router.get('/active', (req, res) => {
  if (activeJobs.size === 0) return res.json(null);
  // 返回第一个活跃任务（当前设计为单任务模式）
  const job = activeJobs.values().next().value;
  // 超时保护：如果任务已经超过 10 分钟，自动清理
  if (Date.now() - job.startTime > 10 * 60 * 1000) {
    activeJobs.delete(job.id);
    return res.json(null);
  }
  res.json({
    id: job.id,
    projectName: job.projectName,
    type: job.type,
    phase: job.phase,
    startTime: job.startTime,
    modules: job.modules,
    serverName: job.serverName,
    logs: job.logs,
  });
});

// POST /api/deploy/build — 仅构建
router.post('/build', async (req, res) => {
  const { projectName, modules = [], nodeVersion } = req.body;
  if (!projectName) return res.status(400).json({ error: 'projectName 必填' });

  const projects = readJSON(PROJECTS_FILE);
  const project = projects.find(p => p.name === projectName);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const broadcast = req.app.get('broadcast');
  const deployId = `build-${Date.now()}`;
  const logs = [];
  const buildModulesLabel = project.type === 'multi-module' ? modules : ['整体构建'];

  registerJob(deployId, { projectName, type: 'build', modules: buildModulesLabel });
  broadcast('status', { id: deployId, phase: 'pulling', projectName });
  res.json({ id: deployId, status: 'started' });

  const onLog = (type, text) => {
    const recordTime = Date.now();
    logs.push({ type, text, time: recordTime });
    jobLog(deployId, type, text);
    broadcast('log', { id: deployId, type, text });

    // 流式物理日志落盘，异步不阻塞
    const logFilePath = path.join(LOGS_DIR, `${deployId}.log`);
    fs.appendFile(logFilePath, `${new Date(recordTime).toISOString()} [${type}] ${text}\n`, 'utf8', (err) => {
      if (err) console.error('[DeployLog] 写入日志文件失败:', err.message);
    });
  };

  // 任务概览
  onLog('info', '╔══════════════════════════════════════════╗');
  onLog('info', '║           🚀 构建任务启动                ║');
  onLog('info', '╚══════════════════════════════════════════╝');
  onLog('info', `📋 项目: ${projectName}`);
  onLog('info', `📦 模块: ${(project.type === 'multi-module' ? modules : ['整体构建']).join(', ')}`);
  onLog('info', `🔧 Node: ${nodeVersion || project.nodeVersion || '系统默认'}`);
  onLog('info', `⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}`);
  onLog('info', '');

  // Node 版本优先级：请求指定 > 项目配置 > 系统默认
  const finalNodeVersion = nodeVersion || project.nodeVersion || '';
  const buildModules = project.type === 'multi-module' ? modules : [];
  const result = await build({
    projectPath: project.path,
    buildCommand: project.buildCommand,
    modules: buildModules,
    nodeVersion: finalNodeVersion,
    onLog,
    onPhase: (phase) => { jobPhase(deployId, phase); broadcast('status', { id: deployId, phase, projectName }); }
  });

  const record = {
    id: deployId,
    timestamp: new Date().toISOString(),
    projectName,
    modules: buildModules.length ? buildModules : ['整体构建'],
    serverId: null, serverName: '—', remotePath: '—',
    status: result.success ? 'success' : 'fail',
    type: 'build-only',
    duration: formatDuration(result.duration),
    logs
  };
  appendHistory(record);
  unregisterJob(deployId);
  broadcast('status', { id: deployId, phase: 'done', ...record });
});

// POST /api/deploy/start — 构建并部署（支持多服务器）
router.post('/start', async (req, res) => {
  const { projectName, modules = [], serverId, serverIds: rawServerIds, remotePath, nodeVersion } = req.body;
  // 兼容旧版：如果没有 serverIds 就用 serverId
  const serverIds = rawServerIds && rawServerIds.length > 0 ? rawServerIds : (serverId ? [serverId] : []);
  if (!projectName || serverIds.length === 0) return res.status(400).json({ error: 'projectName 和至少一个 serverId 必填' });

  const projects = readJSON(PROJECTS_FILE);
  const project = projects.find(p => p.name === projectName);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const allServers = readJSON(SERVERS_FILE);
  const targetServers = serverIds.map(id => allServers.find(s => s.id === id)).filter(Boolean);
  if (targetServers.length === 0) return res.status(404).json({ error: '服务器不存在' });

  const broadcast = req.app.get('broadcast');
  const deployId = `deploy-${Date.now()}`;
  const logs = [];
  const deployModulesLabel = project.type === 'multi-module' ? modules : ['整体构建'];

  registerJob(deployId, { projectName, type: 'deploy', modules: deployModulesLabel, serverName: targetServers.map(s => s.name).join(', ') });
  broadcast('status', { id: deployId, phase: 'pulling', projectName });
  res.json({ id: deployId, status: 'started' });

  const onLog = (type, text) => {
    const recordTime = Date.now();
    logs.push({ type, text, time: recordTime });
    jobLog(deployId, type, text);
    broadcast('log', { id: deployId, type, text });

    // 流式物理日志落盘，异步不阻塞
    const logFilePath = path.join(LOGS_DIR, `${deployId}.log`);
    fs.appendFile(logFilePath, `${new Date(recordTime).toISOString()} [${type}] ${text}\n`, 'utf8', (err) => {
      if (err) console.error('[DeployLog] 写入日志文件失败:', err.message);
    });
  };

  // 任务概览
  onLog('info', '╔══════════════════════════════════════════╗');
  onLog('info', '║        🚀 构建 + 部署 任务启动           ║');
  onLog('info', '╚══════════════════════════════════════════╝');
  onLog('info', `📋 项目: ${projectName}`);
  onLog('info', `📦 模块: ${(project.type === 'multi-module' ? modules : ['整体构建']).join(', ')}`);
  onLog('info', `🖥️  服务器: ${targetServers.map(s => `${s.name} (${s.host})`).join(' → ')}`);
  onLog('info', `📁 远程路径: ${remotePath || '各服务器默认'}`);
  onLog('info', `🔧 Node: ${nodeVersion || project.nodeVersion || '系统默认'}`);
  onLog('info', `⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}`);
  onLog('info', '');

  // Phase 0: 预检 — 验证所有目标服务器连通性 + 远程目录可访问
  onLog('info', '🔍 Phase 0: 服务器预检...');
  jobPhase(deployId, 'preflight');
  broadcast('status', { id: deployId, phase: 'preflight', projectName });

  const preflightResults = await Promise.allSettled(
    targetServers.map(server => {
      const finalPath = remotePath || project.remotePath || server.defaultRemotePath || '/';
      return preflightCheck(server, finalPath, onLog);
    })
  );

  const serverConns = new Map(); // serverId -> conn
  const failedServers = [];
  preflightResults.forEach((r, i) => {
    const server = targetServers[i];
    const result = r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || '未知错误' };
    if (result.success) {
      onLog('success', `  ✅ ${server.name} (${server.host}) — 连接正常, 目录可访问`);
      if (result.conn) serverConns.set(server.id, result.conn);
    } else {
      onLog('error', `  ❌ ${server.name} (${server.host}) — ${result.error}`);
      failedServers.push(server.name);
    }
  });

  if (failedServers.length > 0) {
    onLog('error', '');
    onLog('error', `🚫 预检失败: ${failedServers.join(', ')} 不可达，已中止部署`);
    onLog('error', '   请检查服务器连接配置、VPN 状态或远程目录权限后重试');
    // 关闭所有已建立的连接
    for (const conn of serverConns.values()) { try { conn.end(); } catch {} }
    const record = {
      id: deployId, timestamp: new Date().toISOString(), projectName,
      modules: (project.type === 'multi-module' ? modules : ['整体构建']),
      serverId: serverIds[0], serverIds: serverIds, serverName: targetServers.map(s => s.name).join(', '),
      remotePath: remotePath || '', status: 'fail', type: 'deploy',
      duration: '0s', logs
    };
    appendHistory(record);
    unregisterJob(deployId);
    broadcast('status', { id: deployId, phase: 'done', ...record });
    return;
  }

  onLog('info', '');
  onLog('success', `✅ 预检通过，所有 ${targetServers.length} 台服务器就绪`);
  onLog('info', '');

  // Phase 1: 构建（只构建一次）
  const finalNodeVersion = nodeVersion || project.nodeVersion || '';
  const buildModules = project.type === 'multi-module' ? modules : [];
  const buildResult = await build({
    projectPath: project.path,
    buildCommand: project.buildCommand,
    modules: buildModules,
    nodeVersion: finalNodeVersion,
    onLog,
    onPhase: (phase) => { jobPhase(deployId, phase); broadcast('status', { id: deployId, phase, projectName }); }
  });

  if (!buildResult.success) {
    // 构建失败，关闭所有预检连接
    for (const conn of serverConns.values()) { try { conn.end(); } catch {} }
    const record = {
      id: deployId, timestamp: new Date().toISOString(), projectName,
      modules: buildModules.length ? buildModules : ['整体构建'],
      serverId: serverIds[0], serverIds: serverIds, serverName: targetServers.map(s => s.name).join(', '),
      remotePath: remotePath || '', status: 'fail', type: 'deploy',
      duration: formatDuration(buildResult.duration), logs
    };
    appendHistory(record);
    unregisterJob(deployId);
    broadcast('status', { id: deployId, phase: 'done', ...record });
    return;
  }

  // Phase 2: 依次部署到每台服务器
  const deployModules = project.type === 'multi-module'
    ? modules.map(name => {
        const mod = (project.modules || []).find(m => m.name === name);
        return { name, uploadStrategy: mod ? mod.uploadStrategy : 'folder' };
      })
    : [{ name: '', uploadStrategy: 'folder' }];

  let allSuccess = true;
  let totalDeployDuration = 0;
  let totalFileCount = 0;

  for (let i = 0; i < targetServers.length; i++) {
    const server = targetServers[i];
    const finalRemotePath = remotePath || project.remotePath || server.defaultRemotePath;

    onLog('info', '');
    onLog('info', `${'═'.repeat(50)}`);
    onLog('info', `📡 正在部署到服务器 [${i + 1}/${targetServers.length}]: ${server.name} (${server.host})`);
    onLog('info', `📁 目标路径: ${finalRemotePath}`);
    onLog('info', `${'═'.repeat(50)}`);

    jobPhase(deployId, 'uploading');
    broadcast('status', { id: deployId, phase: 'uploading', projectName, serverIndex: i + 1, serverTotal: targetServers.length });

    const existingConn = serverConns.get(server.id);
    const deployResult = await deploy({
      serverConfig: server,
      localDistDir: path.join(project.path, project.distDir || 'dist'),
      remotePath: finalRemotePath,
      modules: deployModules,
      onLog,
      existingConn,
      onProgress: (current, total) => {
        broadcast('progress', { id: deployId, current, total, percent: Math.round(current / total * 100), serverIndex: i + 1, serverTotal: targetServers.length });
      }
    });

    // 部署完成后关闭该服务器的连接
    if (existingConn) { try { existingConn.end(); } catch {} serverConns.delete(server.id); }

    totalDeployDuration += (deployResult.duration || 0);
    totalFileCount += (deployResult.fileCount || 0);

    if (!deployResult.success) {
      allSuccess = false;
      onLog('error', `❌ 部署到 ${server.name} 失败`);
    } else {
      onLog('success', `✅ 部署到 ${server.name} 成功`);
    }
  }

  const totalDuration = buildResult.duration + totalDeployDuration;
  const record = {
    id: deployId, timestamp: new Date().toISOString(), projectName,
    modules: buildModules.length ? buildModules : ['整体构建'],
    serverId: serverIds[0], serverIds: serverIds, serverName: targetServers.map(s => s.name).join(', '),
    remotePath: remotePath || '',
    status: allSuccess ? 'success' : 'fail',
    type: 'deploy', duration: formatDuration(totalDuration),
    fileCount: totalFileCount, logs
  };
  appendHistory(record);
  unregisterJob(deployId);
  broadcast('status', { id: deployId, phase: 'done', ...record });
});

// GET /api/deploy/last/:projectName — 获取项目最近一次部署/构建记录
router.get('/last/:projectName', (req, res) => {
  const { projectName } = req.params;
  const { type, status } = req.query; // 可选过滤条件

  let sql = 'SELECT id, timestamp, status, type, duration, serverName, modules, remotePath FROM history WHERE projectName = ?';
  const params = [projectName];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY timestamp DESC LIMIT 1';

  try {
    const last = db.prepare(sql).get(...params);
    if (!last) return res.json(null);

    last.modules = JSON.parse(last.modules || '[]');
    last.serverIds = []; // 兼容旧版属性
    res.json(last);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
