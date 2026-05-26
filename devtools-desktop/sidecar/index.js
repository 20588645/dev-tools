/**
 * DevTools Sidecar — Node.js 后端服务
 * 由 Tauri 主进程启动和管理
 * 
 * 启动后输出端口号到 stdout，供 Tauri 读取
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const net = require('net');
const sidecarPackage = require('./package.json');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);

// WebSocket 服务
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * 广播消息给所有已连接的 WebSocket 客户端
 */
function broadcast(type, data) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}

// 挂载 broadcast 到 app 上，供路由使用
app.set('broadcast', broadcast);

// 中间件
app.use(express.json({ limit: '20mb' }));

// CORS（允许 Tauri WebView 访问）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// API 路由
app.use('/api/projects', require('./routes/projects'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/deploy', require('./routes/deploy'));
app.use('/api/run', require('./routes/run'));
app.use('/api/history', require('./routes/history'));
app.use('/api/report', require('./routes/report'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/commands', require('./routes/commands'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/notebook', require('./routes/notebook'));
app.use('/api/upgrade', require('./routes/upgrade'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    pid: process.pid,
    version: sidecarPackage.version,
    dataDir: path.join(__dirname, 'data'),
  });
});

// WebSocket 连接事件
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  console.log('[WS] 客户端已连接');
  ws.on('close', () => console.log('[WS] 客户端已断开'));
  ws.on('error', (err) => console.error('[WS] 客户端连接错误:', err.message));
});

// 全局 30s 心跳定时探测，回收假死连接资源
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    // 1. 如果连接状态不为 OPEN (1)，代表已处于断开或关闭中，直接强制清理，防止 EPIPE 报错
    if (ws.readyState !== 1) {
      console.log('[WS] 检测到连接状态不为 OPEN，正在主动清理旧句柄...');
      return ws.terminate();
    }

    // 2. 如果上一次 Ping 之后没有收到 Pong（isAlive 为 false），判定为假死连接
    if (ws.isAlive === false) {
      console.log('[WS] 检测到僵尸连接（心跳超时），正在强制清理并回收资源...');
      return ws.terminate();
    }

    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      console.error('[WS] 发送心跳 Ping 失败，强行终结:', err.message);
      ws.terminate();
    }
  });
}, 30000);

// 在服务退出时清理定时器，防泄露
process.once('exit', () => {
  clearInterval(heartbeatInterval);
});

/**
 * 查找可用端口
 */
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(startPort, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      // 端口被占用，尝试下一个
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

/**
 * 启动自我净化守护：强行清剿后台残留的旧 Sidecar 僵尸进程
 */
function killOldSidecars() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') return resolve(); // 仅作跨平台防呆
    
    // 查找当前系统里除了自身 PID 之外的所有 sidecar/index.js 进程
    exec(`pgrep -f "sidecar/index.js"`, (err, stdout) => {
      if (err || !stdout) return resolve();
      const pids = stdout.split(/\s+/).map(Number).filter(pid => pid && pid !== process.pid);
      
      if (pids.length > 0) {
        console.log(`[Guardian] 检测到后台存在 ${pids.length} 个残留旧 Sidecar 僵尸进程，正在自动净化...`);
        for (const oldPid of pids) {
          try {
            process.kill(oldPid, 'SIGKILL');
            console.log(`[Guardian] 已强行肃清旧进程 PID: ${oldPid}`);
          } catch (e) {}
        }
        // 稍微等待 150ms 确保端口被操作系统底层彻底释放
        setTimeout(resolve, 150);
      } else {
        resolve();
      }
    });
  });
}

// 启动
async function main() {
  // 先执行一次自我净化，扫除所有残留僵尸 Sidecar，彻底杜绝端口偏移与缓存问题！
  await killOldSidecars();

  const port = await findAvailablePort(13456);

  server.listen(port, '127.0.0.1', () => {
    // 输出端口号到 stdout，Tauri 主进程会读取这一行
    console.log(`__PORT__:${port}`);
    console.log(`[Sidecar] DevTools 后端已启动: http://127.0.0.1:${port}`);
    console.log(`[Sidecar] WebSocket: ws://127.0.0.1:${port}/ws`);
    console.log(`[Sidecar] PID: ${process.pid}`);
  });
}

main();

// 全局异常兜底
process.on('uncaughtException', (err) => {
  console.error('[FATAL] 未捕获异常:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] 未处理的 Promise 拒绝:', reason);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('[Sidecar] 收到 SIGTERM，正在关闭...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Sidecar] 收到 SIGINT，正在关闭...');
  server.close(() => process.exit(0));
});
