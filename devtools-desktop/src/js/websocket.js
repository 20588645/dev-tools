/**
 * WebSocket 连接管理
 * 桌面版：连接本地 sidecar 端口
 * 支持指数退避重连
 */
const WS = {
  socket: null,
  handlers: {},
  reconnectTimer: null,
  port: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 50,
  baseDelay: 3000,    // 初始 3 秒
  maxDelay: 30000,    // 最大 30 秒

  connect(port) {
    if (port) this.port = port;
    if (!this.port) {
      const match = API_BASE && API_BASE.match(/:(\d+)$/);
      if (match) this.port = parseInt(match[1]);
      else this.port = 13456;
    }

    const url = 'ws://127.0.0.1:' + this.port + '/ws';

    try {
      this.socket = new WebSocket(url);
    } catch (e) {
      console.error('[WS] 创建连接失败:', e.message);
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      console.log('[WS] 已连接');
      this.reconnectAttempts = 0; // 连接成功，重置计数

      // 重连后的活跃任务恢复由订阅 'open' 的 Vue 服务处理（deploy-realtime-service
      // 与 run-runtime-service），此处不再直接调用 legacy 的 checkActiveJob。
      // Dispatch open event to handlers
      const fns = this.handlers['open'] || [];
      fns.forEach(fn => {
        try { fn(); } catch (e) { console.error('[WS] Open handler error:', e); }
      });
    };

    this.socket.onclose = () => {
      console.log('[WS] 已断开');
      this._scheduleReconnect();
    };

    this.socket.onerror = (e) => {
      console.warn('[WS] 连接错误');
      // onerror 后通常会触发 onclose，不需要在这里重连
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const fns = this.handlers[msg.type] || [];
        fns.forEach(fn => fn(msg.data));
      } catch (e) {
        console.error('[WS] 消息解析失败:', e);
      }
    };
  },

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] 已达最大重连次数，停止重连');
      return;
    }
    // 指数退避：3s, 6s, 12s, 24s, 30s(max)
    const delay = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts), this.maxDelay);
    this.reconnectAttempts++;
    console.log(`[WS] ${delay / 1000}s 后第 ${this.reconnectAttempts} 次重连...`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  },

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  },

  off(type, handler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(fn => fn !== handler);
  }
};

/*
  显式挂到 window。顶层 `const` 在传统脚本里只创建脚本作用域绑定，不会成为
  window 属性，因此 Vue 侧（模块作用域，看不到裸标识符 WS）通过
  `globalThis.WS` 取值时恒为 undefined——已迁页面的 WS 订阅会静默失效。
  迁移期两侧共用这一条连接，故在此显式导出；WS 全量迁入 Vue 后可删。
*/
window.WS = WS;

// ========== 启动链（P9-4 自 app.js 迁入） ==========
// 经典侧仅剩职责：发现 sidecar 端口（api.js 的 initAPI）后建立共享 WS 连接。
// Vue 的模块脚本先于 DOMContentLoaded 执行，各服务经 window.WS 的订阅不会漏。
document.addEventListener('DOMContentLoaded', async () => {
  await initAPI();
  WS.connect();
});

// 设置页重启 Sidecar 后端口可能变化：API_BASE（api.js 的全局词法绑定）与
// WS 连接一起切到新端口，并重置退避计数立即重连。
window.addEventListener('devtools:sidecar-restarted', (event) => {
  const port = Number(event.detail?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  API_BASE = 'http://127.0.0.1:' + port;
  clearTimeout(WS.reconnectTimer);
  if (WS.socket) {
    try {
      WS.socket.onclose = null;
      WS.socket.close();
    } catch (e) {}
  }
  WS.reconnectAttempts = 0;
  WS.connect(port);
});
