/**
 * WebSocket 连接管理
 * 自动重连 + 消息分发
 */
const WS = {
  socket: null,
  handlers: {},
  reconnectTimer: null,
  port: null,

  connect(port) {
    this.port = port || this.port;
    if (!this.port) return;

    const url = 'ws://127.0.0.1:' + this.port + '/ws';
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('[WS] 已连接');
      const dot = document.querySelector('.status-dot');
      const text = document.querySelector('.status-text');
      if (dot) dot.style.background = 'var(--success)';
      if (text) text.textContent = '服务运行中';
    };

    this.socket.onclose = () => {
      console.log('[WS] 已断开，3秒后重连...');
      const dot = document.querySelector('.status-dot');
      const text = document.querySelector('.status-text');
      if (dot) dot.style.background = 'var(--danger)';
      if (text) text.textContent = '连接断开';
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
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

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  },

  off(type, handler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(fn => fn !== handler);
  }
};
