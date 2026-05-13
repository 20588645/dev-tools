/**
 * 服务器配置 CRUD API + FileZilla 导入
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { Client } = require('ssh2');
const { encrypt, decrypt } = require('../services/crypto');

const DATA_FILE = path.join(__dirname, '../data/servers.json');

function readServers() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeServers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ========== 固定路径路由（必须在 /:id 之前） ==========

// GET /api/servers — 列表（密码脱敏）
router.get('/', (req, res) => {
  const servers = readServers().map(s => ({
    ...s,
    password: s.password ? '******' : undefined
  }));
  res.json(servers);
});

// POST /api/servers — 新增
router.post('/', (req, res) => {
  const { name, host, port = 22, username = 'root', authType = 'password', password, defaultRemotePath = '/', deployPaths = [] } = req.body;
  if (!name || !host) return res.status(400).json({ error: '名称和 Host 必填' });

  const servers = readServers();
  const server = {
    id: `server-${uuidv4().slice(0, 8)}`,
    name, host, port: Number(port), username, authType,
    password: password ? encrypt(password) : null,
    defaultRemotePath,
    deployPaths: Array.isArray(deployPaths) ? deployPaths : [],
  };
  servers.push(server);
  writeServers(servers);
  res.json({ ...server, password: '******' });
});

// ========== FileZilla 导入 ==========

/**
 * 解析 FileZilla sitemanager.xml，提取 SFTP 服务器列表
 */
function parseFileZillaXml(xmlContent) {
  const servers = [];
  const serverBlocks = xmlContent.match(/<Server>[\s\S]*?<\/Server>/g) || [];

  for (const block of serverBlocks) {
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    const protocol = getTag('Protocol');
    // 只导入 SFTP (Protocol=1)，跳过 FTP (Protocol=0)
    if (protocol !== '1') continue;

    const passEncoding = block.match(/<Pass encoding="([^"]*)"/);
    const rawPass = getTag('Pass');
    let password = '';
    if (rawPass) {
      if (passEncoding && passEncoding[1] === 'base64') {
        password = Buffer.from(rawPass, 'base64').toString('utf8');
      } else {
        password = rawPass;
      }
    }

    servers.push({
      name: getTag('Name'),
      host: getTag('Host'),
      port: parseInt(getTag('Port'), 10) || 22,
      username: getTag('User') || 'root',
      password,
      defaultRemotePath: '/var/www/',
    });
  }

  return servers;
}

function findFileZillaConfig() {
  const possiblePaths = [
    path.join(os.homedir(), '.config/filezilla/sitemanager.xml'),
    path.join(os.homedir(), 'Library/Application Support/FileZilla/sitemanager.xml'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// GET /api/servers/filezilla — 读取本机 FileZilla 配置（支持 ?xmlPath= 自定义路径）
router.get('/filezilla', (req, res) => {
  const xmlPath = req.query.xmlPath || findFileZillaConfig();
  if (!xmlPath) return res.status(404).json({ error: '未找到 FileZilla 配置文件 (sitemanager.xml)' });
  if (!fs.existsSync(xmlPath)) return res.status(404).json({ error: `文件不存在: ${xmlPath}` });

  try {
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    const parsed = parseFileZillaXml(xmlContent);
    const existing = readServers();

    const result = parsed.map(s => ({
      ...s,
      password: '******',
      exists: existing.some(e => e.host === s.host && e.port === s.port),
    }));

    res.json({ path: xmlPath, servers: result });
  } catch (err) {
    res.status(500).json({ error: `解析失败: ${err.message}` });
  }
});

// POST /api/servers/filezilla/parse — 解析上传的 XML 内容
router.post('/filezilla/parse', (req, res) => {
  const { xmlContent } = req.body;
  if (!xmlContent) return res.status(400).json({ error: '缺少 XML 内容' });

  try {
    const parsed = parseFileZillaXml(xmlContent);
    const existing = readServers();
    const result = parsed.map(s => ({
      ...s,
      password: '******',
      exists: existing.some(e => e.host === s.host && e.port === s.port),
    }));
    res.json({ servers: result });
  } catch (err) {
    res.status(500).json({ error: `解析失败: ${err.message}` });
  }
});

// POST /api/servers/filezilla/import — 批量导入选中的 FileZilla 服务器
router.post('/filezilla/import', (req, res) => {
  const { selected = [], xmlContent, xmlPath: customPath } = req.body;
  if (selected.length === 0) return res.status(400).json({ error: '请选择要导入的服务器' });

  let xmlData;
  try {
    if (xmlContent) {
      // 前端上传的 XML 内容
      xmlData = xmlContent;
    } else {
      // 从服务器本地文件读取
      const xmlPath = customPath || findFileZillaConfig();
      if (!xmlPath || !fs.existsSync(xmlPath)) return res.status(404).json({ error: '未找到 FileZilla 配置文件' });
      xmlData = fs.readFileSync(xmlPath, 'utf8');
    }

    const parsed = parseFileZillaXml(xmlData);
    const servers = readServers();
    const added = [];
    const skipped = [];

    for (const s of parsed) {
      if (!selected.includes(s.name)) continue;
      if (servers.some(e => e.host === s.host && e.port === s.port)) {
        skipped.push(s.name);
        continue;
      }

      servers.push({
        id: `server-${uuidv4().slice(0, 8)}`,
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        authType: 'password',
        password: s.password ? encrypt(s.password) : null,
        defaultRemotePath: s.defaultRemotePath,
      });
      added.push(s.name);
    }

    writeServers(servers);
    res.json({ added, skipped });
  } catch (err) {
    res.status(500).json({ error: `导入失败: ${err.message}` });
  }
});

// ========== 动态路径路由（/:id 放最后） ==========

// PUT /api/servers/:id — 更新
router.put('/:id', (req, res) => {
  const servers = readServers();
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '服务器不存在' });

  const { name, host, port, username, authType, password, defaultRemotePath, deployPaths } = req.body;
  if (name !== undefined) servers[idx].name = name;
  if (host !== undefined) servers[idx].host = host;
  if (port !== undefined) servers[idx].port = Number(port);
  if (username !== undefined) servers[idx].username = username;
  if (authType !== undefined) servers[idx].authType = authType;
  if (password !== undefined) servers[idx].password = encrypt(password);
  if (defaultRemotePath !== undefined) servers[idx].defaultRemotePath = defaultRemotePath;
  if (deployPaths !== undefined) servers[idx].deployPaths = Array.isArray(deployPaths) ? deployPaths : [];

  writeServers(servers);
  res.json({ ...servers[idx], password: '******' });
});

// DELETE /api/servers/:id
router.delete('/:id', (req, res) => {
  const servers = readServers();
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '服务器不存在' });
  servers.splice(idx, 1);
  writeServers(servers);
  res.json({ success: true });
});
// POST /api/servers/:id/quick-test — 快速连接测试（同步返回结果，不走 WebSocket）
router.post('/:id/quick-test', async (req, res) => {
  const servers = readServers();
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: '服务器不存在' });

  const { Client } = require('ssh2');
  const conn = new Client();
  const startTime = Date.now();
  let responded = false;

  const safeRes = (data) => {
    if (responded) return;
    responded = true;
    res.json(data);
  };

  const timeout = setTimeout(() => {
    conn.end();
    safeRes({ success: false, error: '连接超时 (15s)', duration: Date.now() - startTime });
  }, 15000);

  conn.on('ready', () => {
    clearTimeout(timeout);
    const duration = Date.now() - startTime;
    conn.end();
    safeRes({ success: true, duration });
  });

  conn.on('error', (err) => {
    clearTimeout(timeout);
    safeRes({ success: false, error: err.message, duration: Date.now() - startTime });
  });

  const decryptedPwd = server.password ? decrypt(server.password) : '';

  conn.connect({
    host: server.host,
    port: server.port,
    username: server.username,
    password: decryptedPwd,
    tryKeyboard: true,
    readyTimeout: 15000,
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

// POST /api/servers/:id/test — 测试连接（通过 WebSocket 推送详细日志）
router.post('/:id/test', (req, res) => {
  const servers = readServers();
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: '服务器不存在' });

  const broadcast = req.app.get('broadcast');
  const testId = `test-${Date.now()}`;
  const startTime = Date.now();

  // 立即返回 testId，后续通过 WebSocket 推送日志
  res.json({ id: testId, status: 'testing' });

  const log = (type, text) => {
    broadcast('log', { id: testId, type, text });
  };

  log('info', `状态:    正在连接到 ${server.host}:${server.port}...`);

  const conn = new Client();
  const CONN_TIMEOUT = 60000;
  const timeout = setTimeout(() => {
    conn.end();
    log('error', `状态:    连接超时 (${CONN_TIMEOUT / 1000}s)`);
    broadcast('status', { id: testId, phase: 'done', status: 'fail' });
  }, CONN_TIMEOUT);

  conn.on('handshake', (negotiated) => {
    log('info', `状态:    SSH 握手完成`);
    if (negotiated.kex) log('info', `状态:    密钥交换: ${negotiated.kex}`);
    if (negotiated.cs && negotiated.cs.cipher) log('info', `状态:    加密算法: ${negotiated.cs.cipher}`);
  });

  conn.on('ready', () => {
    const elapsed = Date.now() - startTime;
    log('success', `状态:    Connected to ${server.host}`);
    log('info', `状态:    Using username "${server.username}"`);
    log('info', `状态:    认证成功 (${elapsed}ms)`);
    log('info', `状态:    正在初始化 SFTP 会话...`);

    // 尝试 SFTP 列目录
    conn.sftp((err, sftp) => {
      if (err) {
        log('warn', `状态:    SFTP 初始化失败: ${err.message}`);
        log('success', `\n✓ SSH 连接测试通过 (${elapsed}ms)`);
        clearTimeout(timeout);
        conn.end();
        broadcast('status', { id: testId, phase: 'done', status: 'success', duration: elapsed });
        return;
      }

      log('success', `状态:    SFTP 会话已建立`);

      // 列出根目录或默认部署路径
      const targetDir = server.defaultRemotePath || '/';
      log('info', `状态:    Listing directory "${targetDir}"...`);

      sftp.readdir(targetDir, (err2, list) => {
        if (err2) {
          log('warn', `状态:    目录读取失败: ${err2.message}，尝试 / 根目录`);
          sftp.readdir('/', (err3, rootList) => {
            if (!err3 && rootList) {
              showDirList(rootList, '/', log);
            }
            finishTest();
          });
        } else {
          showDirList(list, targetDir, log);
          finishTest();
        }
      });

      function finishTest() {
        const totalElapsed = Date.now() - startTime;
        log('success', `\n✓ 连接测试全部通过 (${totalElapsed}ms)`);
        clearTimeout(timeout);
        conn.end();
        broadcast('status', { id: testId, phase: 'done', status: 'success', duration: totalElapsed });
      }
    });
  });

  conn.on('error', (err) => {
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    log('error', `状态:    连接失败: ${err.message}`);
    log('error', `\n✗ 连接测试失败 (${elapsed}ms)`);
    broadcast('status', { id: testId, phase: 'done', status: 'fail', error: err.message });
  });

  const decryptedPwd = server.password ? decrypt(server.password) : '';

  conn.connect({
    host: server.host,
    port: server.port,
    username: server.username,
    password: decryptedPwd,
    tryKeyboard: true,
    readyTimeout: 60000,
    // 跳过 none 探测，部分 SSH 服务器不响应 none 请求会导致超时
    authHandler: (() => {
      let attempts = 0;
      return (methodsLeft, partialSuccess, callback) => {
        if (methodsLeft === null) {
          attempts = 0;
          return callback('password');
        }
        attempts++;
        if (attempts > 2) return callback(false); // 防止无限重试
        if (methodsLeft.includes('password')) return callback('password');
        if (methodsLeft.includes('keyboard-interactive')) return callback('keyboard-interactive');
        callback(false);
      };
    })(),
  });

  // keyboard-interactive 回调：自动用密码应答
  conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
    log('info', `状态:    keyboard-interactive 认证...`);
    finish([decryptedPwd]);
  });
});

/**
 * 在日志中展示远程目录列表（类似 FileZilla 的效果）
 */
function showDirList(list, dirPath, log) {
  log('success', `状态:    成功获取 "${dirPath}" 的目录`);
  log('info', '');
  log('info', `远程目录: ${dirPath}`);
  log('info', '─'.repeat(60));

  // 按类型排序：目录在前，文件在后
  const sorted = list.sort((a, b) => {
    const aIsDir = a.longname.startsWith('d');
    const bIsDir = b.longname.startsWith('d');
    if (aIsDir !== bIsDir) return bIsDir - aIsDir;
    return a.filename.localeCompare(b.filename);
  });

  // 最多显示 20 条
  const display = sorted.slice(0, 20);
  for (const item of display) {
    const isDir = item.longname.startsWith('d');
    const icon = isDir ? '📁' : '📄';
    const size = isDir ? '<DIR>' : formatBytes(item.attrs.size);
    const mtime = new Date(item.attrs.mtime * 1000).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    log('info', `  ${icon} ${item.filename.padEnd(30)} ${size.padStart(10)}  ${mtime}`);
  }

  if (sorted.length > 20) {
    log('info', `  ... 还有 ${sorted.length - 20} 个文件/目录`);
  }
  log('info', `\n共 ${sorted.length} 个项目`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// POST /api/servers/:id/browse — 远程目录浏览 (SFTP)
router.post('/:id/browse', (req, res) => {
  const servers = readServers();
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: '服务器不存在' });

  const targetDir = req.body.path || server.defaultRemotePath || '/';
  const decryptedPwd = server.password ? decrypt(server.password) : '';

  // 防止 timeout / error / success 多次向同一个 res 发送响应
  let responded = false;
  function safeJson(status, body) {
    if (responded) return;
    responded = true;
    clearTimeout(timeout);
    try { conn.end(); } catch (_) { /* ignore */ }
    res.status(status).json(body);
  }

  const conn = new Client();
  const timeout = setTimeout(() => {
    safeJson(504, { error: '连接超时 (20s)' });
  }, 20000);

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) return safeJson(500, { error: `SFTP 会话失败: ${err.message}` });

      // 尝试读取目标目录，失败则逐级回退到根目录
      tryReadDir(sftp, targetDir);

      function tryReadDir(sftp, dir) {
        sftp.readdir(dir, (err2, list) => {
          if (err2) {
            // 目录不存在，自动回退到上级或根目录
            if (dir !== '/') {
              const parent = dir.replace(/\/[^/]+\/?$/, '') || '/';
              return tryReadDir(sftp, parent);
            }
            // 根目录也失败，只能报错
            return safeJson(400, { error: `目录读取失败: ${err2.message}`, path: dir });
          }

          const items = list.map(item => ({
            name: item.filename,
            isDir: item.longname.startsWith('d'),
            size: item.attrs.size || 0,
            mtime: item.attrs.mtime * 1000,
          })).sort((a, b) => {
            if (a.isDir !== b.isDir) return b.isDir - a.isDir;
            return a.name.localeCompare(b.name);
          });

          // fallback 标记：告诉前端实际展示的路径与请求路径不同
          safeJson(200, {
            path: dir,
            items,
            fallback: dir !== targetDir ? `路径 ${targetDir} 不存在，已自动跳转到 ${dir}` : undefined,
          });
        });
      }
    });
  });

  conn.on('error', (err) => {
    safeJson(500, { error: `连接失败: ${err.message}` });
  });

  conn.connect({
    host: server.host,
    port: server.port,
    username: server.username,
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

module.exports = router;
