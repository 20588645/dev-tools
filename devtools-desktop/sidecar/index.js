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
  console.log('[WS] 客户端已连接');
  ws.on('close', () => console.log('[WS] 客户端已断开'));
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

// 启动
async function main() {
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
