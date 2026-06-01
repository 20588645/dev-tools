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
      if (typeof checkActiveJob === 'function') checkActiveJob();
      
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
