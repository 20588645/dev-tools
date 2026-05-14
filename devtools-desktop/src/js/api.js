/**
 * API 调用封装
 * 桌面版：自动检测 sidecar 端口
 */
let API_BASE = '';

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

  async del(url) {
    const res = await fetch(API_BASE + url, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async delete(url, data) {
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
