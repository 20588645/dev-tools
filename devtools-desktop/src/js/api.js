/**
 * API 调用封装
 * 自动检测 sidecar 端口并发起请求
 */
let API_BASE = '';

/**
 * 初始化 API 基础地址
 * 在 Tauri 环境中通过 IPC 获取 sidecar 端口
 * 在浏览器中使用默认端口（开发调试用）
 */
async function initAPI() {
  if (window.__TAURI__) {
    try {
      const port = await window.__TAURI__.core.invoke('get_sidecar_port');
      API_BASE = 'http://127.0.0.1:' + port;
      console.log('[API] Sidecar 端口:', port);
    } catch (e) {
      console.error('[API] 获取 sidecar 端口失败:', e);
      API_BASE = 'http://127.0.0.1:13456';
    }
  } else {
    // 浏览器开发模式
    API_BASE = 'http://127.0.0.1:13456';
  }
}

const API = {
  async get(url) {
    const res = await fetch(API_BASE + url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(API_BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async put(url, data) {
    const res = await fetch(API_BASE + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async del(url, data) {
    const opts = { method: 'DELETE' };
    if (data) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(API_BASE + url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }
};
