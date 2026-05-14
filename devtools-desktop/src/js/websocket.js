/**
 * WebSocket 连接管理
 * 桌面版：连接本地 sidecar 端口
 */
const WS = {
  socket: null,
  handlers: {},
  reconnectTimer: null,
  port: null,

  connect(port) {
    if (port) this.port = port;
    if (!this.port) {
      // 从 API_BASE 提取端口
      const match = API_BASE && API_BASE.match(/:(\d+)$/);
      if (match) this.port = parseInt(match[1]);
      else this.port = 13456;
    }

    const url = 'ws://127.0.0.1:' + this.port + '/ws';
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('[WS] 已连接');
      const dot = document.querySelector('.status-dot');
      const text = document.querySelector('.status-text');
      if (dot) dot.style.background = 'var(--success)';
      if (text) text.textContent = '服务运行中';
      // 重连后检查活跃任务
      if (typeof checkActiveJob === 'function') checkActiveJob();
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
