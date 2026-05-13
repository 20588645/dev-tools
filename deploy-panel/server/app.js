/**
 * Deploy Panel — Express + WebSocket 主入口
 * 绑定 127.0.0.1:3456，仅本机可访问
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

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
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API 路由
app.use('/api/projects', require('./routes/projects'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/deploy', require('./routes/deploy'));
app.use('/api/history', require('./routes/history'));

// WebSocket 连接事件
wss.on('connection', (ws) => {
  console.log('[WS] 客户端已连接');
  ws.on('close', () => console.log('[WS] 客户端已断开'));
});

// 启动
const PORT = process.env.PORT || 3456;
const HOST = '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 Deploy Panel 已启动`);
  console.log(`   地址: http://${HOST}:${PORT}`);
  console.log(`   WebSocket: ws://${HOST}:${PORT}/ws\n`);
});

// 全局异常兜底：防止单个请求错误导致整个进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] 未捕获异常 (进程继续运行):', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] 未处理的 Promise 拒绝:', reason);
});
