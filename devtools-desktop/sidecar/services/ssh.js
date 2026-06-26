/**
 * SSH 连接共享工厂
 * 统一封装所有 SSH 连接点的样板：密码解密、authHandler（password→keyboard-interactive
 * 回退、最多 2 轮防无限重试、跳过 none 探测）、keyboard-interactive 自动应答、tryKeyboard、
 * readyTimeout，外加一道连接守卫超时兜底。
 *
 * 历史上 servers.js 的 quick-test/test/browse 各抄了一份一模一样的 conn.connect 配置，
 * 持久会话池又要再抄一份——这里抽出来消重复，连接行为只有一处权威定义。
 */
const { Client } = require('ssh2');
const { decrypt } = require('./crypto');
const db = require('./database');

/**
 * 构造 ssh2 的 authHandler：先 password，再 keyboard-interactive，最多 2 轮。
 * 跳过 none 探测——部分 SSH 服务器对 none 不响应会一路拖到超时。
 */
function makeAuthHandler() {
  let attempts = 0;
  return (methodsLeft, partialSuccess, callback) => {
    if (methodsLeft === null) { attempts = 0; return callback('password'); }
    attempts++;
    if (attempts > 2) return callback(false);
    if (methodsLeft.includes('password')) return callback('password');
    if (methodsLeft.includes('keyboard-interactive')) return callback('keyboard-interactive');
    callback(false);
  };
}

/**
 * 建立一个就绪的 SSH 连接。
 * @param {Object} server 服务器记录（password 为加密对象或空）
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] 连接超时，默认取 db.getConnTimeoutMs()
 * @param {number} [opts.keepaliveInterval] 协议级 keepalive 间隔（持久会话用，短连接可不传）
 * @param {number} [opts.keepaliveCountMax] keepalive 最大失败次数
 * @param {Function} [opts.onHandshake] 握手完成回调 (negotiated)
 * @param {Function} [opts.onKeyboardInteractive] keyboard-interactive 触发回调
 * @returns {Promise<import('ssh2').Client>} 就绪后的 Client（调用方负责 .end()）
 */
function createSshConnection(server, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs || db.getConnTimeoutMs();
    const decryptedPwd = server && server.password ? decrypt(server.password) : '';
    const conn = new Client();
    let settled = false;

    // 连接守卫：ssh2 的 readyTimeout 在个别边角不触发，这里再兜一道，保证调用方不会永久挂起
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      reject(new Error(`连接超时 (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);

    conn.on('ready', () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(conn);
    });

    // 就绪前的错误 → reject；就绪后的错误留给调用方自己的监听处理（这里 settled 后变为空操作，
    // 但仍是一个已注册的 error 监听，可防止 Node 因无监听而抛 "Unhandled error"）
    conn.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      reject(err);
    });

    if (typeof opts.onHandshake === 'function') conn.on('handshake', opts.onHandshake);

    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      if (typeof opts.onKeyboardInteractive === 'function') opts.onKeyboardInteractive();
      finish([decryptedPwd]);
    });

    const connectConfig = {
      host: server.host,
      port: Number(server.port) || 22,
      username: server.username,
      password: decryptedPwd,
      tryKeyboard: true,
      readyTimeout: timeoutMs,
      authHandler: makeAuthHandler(),
    };
    if (opts.keepaliveInterval) connectConfig.keepaliveInterval = opts.keepaliveInterval;
    if (opts.keepaliveCountMax) connectConfig.keepaliveCountMax = opts.keepaliveCountMax;

    conn.connect(connectConfig);
  });
}

module.exports = { createSshConnection, makeAuthHandler };
