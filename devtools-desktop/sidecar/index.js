/**
 * DevTools Sidecar — Node.js 后端服务
 * 由 Tauri 主进程启动和管理
 * 
 * 启动后输出端口号到 stdout，供 Tauri 读取
 */
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // 忽略 stdout 管道破裂（Tauri 在读取端口后可能关闭 stdout 管道）
  }
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // 同样忽略 stderr 管道破裂
  }
});

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const net = require('net');
const fs = require('fs');
const sidecarPackage = require('./package.json');
const { exec } = require('child_process');

let pty = null;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('[Sidecar] 无法加载 node-pty，将启用 child_process.spawn 管道降级模式:', e.message);
}

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
app.use('/api/ipcheck', require('./routes/ipcheck'));
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

  const ptyProcesses = new Map();

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      if (!msg.data) return;
      const { terminalId } = msg.data;

      if (msg.type === 'terminal-init') {
        if (!terminalId) return;

        let ptyProcess = ptyProcesses.get(terminalId);
        if (ptyProcess) {
          try { ptyProcess.kill(); } catch (e) {}
          ptyProcesses.delete(terminalId);
        }

        const shell = process.platform === 'win32'
          ? 'powershell.exe'
          : (process.env.SHELL || '/bin/bash');
        const shellArgs = process.platform === 'win32' ? [] : ['-l'];
        const defaultCwd = process.env.HOME || process.env.USERPROFILE || __dirname;
        const cwd = msg.data.cwd && fs.existsSync(msg.data.cwd) ? msg.data.cwd : defaultCwd;

        if (pty) {
          const currentPty = pty.spawn(shell, shellArgs, {
            name: 'xterm-color',
            cols: msg.data.cols || 80,
            rows: msg.data.rows || 24,
            cwd: cwd,
            env: {
              ...process.env,
              TERM: 'xterm-256color'
            }
          });
          ptyProcess = currentPty;

          currentPty.onData((data) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'terminal-output', data: { terminalId, data } }));
            }
          });

          currentPty.onExit(({ exitCode, signal }) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'terminal-exit', data: { terminalId, exitCode, signal } }));
            }
            if (ptyProcesses.get(terminalId) === currentPty) {
              ptyProcesses.delete(terminalId);
            }
          });
        } else {
          // 降级模式：使用 standard child_process spawn
          const { spawn } = require('child_process');
          const child = spawn(shell, shellArgs, {
            cwd: cwd,
            env: {
              ...process.env,
              TERM: 'xterm-color'
            }
          });

          const currentPty = {
            pid: child.pid,
            write: (data) => {
              if (child.stdin && child.stdin.writable) {
                try {
                  child.stdin.write(data);
                } catch (e) {
                  console.error(`[PTY] Child stdin write error:`, e.message);
                }
              }
            },
            resize: () => {}, // 降级模式不支持 resize
            kill: () => child.kill()
          };
          ptyProcess = currentPty;

          child.stdout.on('data', (data) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'terminal-output', data: { terminalId, data: data.toString() } }));
            }
          });
          child.stderr.on('data', (data) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'terminal-output', data: { terminalId, data: data.toString() } }));
            }
          });
          child.on('close', (exitCode, signal) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'terminal-exit', data: { terminalId, exitCode, signal } }));
            }
            if (ptyProcesses.get(terminalId) === currentPty) {
              ptyProcesses.delete(terminalId);
            }
          });
        }

        ptyProcesses.set(terminalId, ptyProcess);
        console.log(`[PTY] Created shell with pid ${ptyProcess.pid} for terminal ${terminalId} at ${cwd}`);
      } else if (msg.type === 'terminal-input') {
        if (!terminalId) return;
        const ptyProcess = ptyProcesses.get(terminalId);
        if (ptyProcess) {
          try {
            ptyProcess.write(msg.data.data);
          } catch (e) {
            console.error(`[PTY] Write error for ${terminalId}:`, e.message);
          }
        }
      } else if (msg.type === 'terminal-resize') {
        if (!terminalId) return;
        const ptyProcess = ptyProcesses.get(terminalId);
        if (ptyProcess && pty) {
          try {
            ptyProcess.resize(msg.data.cols, msg.data.rows);
          } catch (e) {
            console.error(`[PTY] Resize error for ${terminalId}:`, e.message);
          }
        }
      } else if (msg.type === 'terminal-close') {
        if (!terminalId) return;
        const ptyProcess = ptyProcesses.get(terminalId);
        if (ptyProcess) {
          try { ptyProcess.kill(); } catch (e) {}
          ptyProcesses.delete(terminalId);
          console.log(`[PTY] Closed terminal ${terminalId}`);
        }
      } else if (msg.type === 'frontend-error') {
        console.error('\n[BROWSER FATAL]', msg.data.message, '\nStack:', msg.data.stack);
      } else if (msg.type === 'frontend-log') {
        console.log('[FRONTEND LOG]', msg.data);
      }
    } catch (err) {
      console.error('[WS] Message parsing error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] 客户端已断开');
    for (const [tid, ptyProc] of ptyProcesses.entries()) {
      console.log(`[PTY] Killing shell process ${ptyProc.pid} for terminal ${tid}`);
      try { ptyProc.kill(); } catch (e) {}
    }
    ptyProcesses.clear();
  });

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
  console.error('[FATAL] 未捕获异常:', err.stack || err.message);
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

// ========== 父进程（Tauri）存活守护定时器 ==========
// 每 1.2 秒检查一次父进程是否依然存活。如果 Tauri 闪退或被强杀，子进程的 ppid 在 macOS 会自动变为 1（被 launchd 领养）
setInterval(() => {
  if (process.ppid === 1) {
    console.error('[Guard] 检测到父进程 (Tauri) 已经非正常关闭 (ppid 变为 1)。正在执行应急清理并自动退出...');
    process.exit(1); // 触发同步 exit 监听清理子项目进程组
  }
}, 1200);
