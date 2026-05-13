/**
 * WebSocket 连接管理
 * 自动重连 + 消息分发
 */
const WS = {
  socket: null,
  handlers: {},
  reconnectTimer: null,

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.onopen = () => {
      console.log('[WS] 已连接');
      document.querySelector('.status-dot').style.background = 'var(--success)';
      document.querySelector('.status-text').textContent = '服务运行中';
      // 重连后检查是否有活跃任务需要恢复
      if (typeof checkActiveJob === 'function') checkActiveJob();
    };

    this.socket.onclose = () => {
      console.log('[WS] 已断开，3秒后重连...');
      document.querySelector('.status-dot').style.background = 'var(--danger)';
      document.querySelector('.status-text').textContent = '连接断开';
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
