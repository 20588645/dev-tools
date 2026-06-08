/**
 * API 调用封装
 * 桌面版：自动检测 sidecar 端口
 */
let API_BASE = '';

const API_TIMEOUT = 15000; // 15秒超时

/**
 * 多路径探测 Tauri invoke：
 * - withGlobalTauri 封装：window.__TAURI__.core.invoke（部分打包环境未注入）
 * - 旧式：window.__TAURI__.invoke
 * - 底层内部 IPC：window.__TAURI_INTERNALS__.invoke（打包环境通常都在）
 */
function getTauriInvoke() {
  return (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
      || (window.__TAURI__ && window.__TAURI__.invoke)
      || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
      || null;
}
function hasTauri() { return !!getTauriInvoke(); }
async function tauriInvoke(cmd, args) {
  const fn = getTauriInvoke();
  if (!fn) throw new Error('Tauri 调用不可用');
  return fn(cmd, args);
}

async function initAPI() {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const port = await invoke('get_sidecar_port');
      API_BASE = 'http://127.0.0.1:' + port;
      console.log('[API] Sidecar 端口:', port);
    } catch (e) {
      console.error('[API] 获取 sidecar 端口失败:', e);
      API_BASE = 'http://127.0.0.1:13456';
    }
  } else {
    API_BASE = 'http://127.0.0.1:13456';
  }
}

/**
 * 带超时的 fetch 封装
 */
function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * 统一处理响应
 */
async function handleResponse(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

const API = {
  async get(url) {
    try {
      const res = await fetchWithTimeout(API_BASE + url);
      return handleResponse(res);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时，请检查 Sidecar 状态');
      if (e.message === 'Failed to fetch' || e.message === 'Load failed') throw new Error('无法连接 Sidecar 服务');
      throw e;
    }
  },

  async post(url, data) {
    try {
      const res = await fetchWithTimeout(API_BASE + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleResponse(res);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时，请检查 Sidecar 状态');
      if (e.message === 'Failed to fetch' || e.message === 'Load failed') throw new Error('无法连接 Sidecar 服务');
      throw e;
    }
  },

  async put(url, data) {
    try {
      const res = await fetchWithTimeout(API_BASE + url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleResponse(res);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时，请检查 Sidecar 状态');
      if (e.message === 'Failed to fetch' || e.message === 'Load failed') throw new Error('无法连接 Sidecar 服务');
      throw e;
    }
  },

  async del(url, data) {
    try {
      const opts = { method: 'DELETE' };
      if (data) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(data);
      }
      const res = await fetchWithTimeout(API_BASE + url, opts);
      return handleResponse(res);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时，请检查 Sidecar 状态');
      if (e.message === 'Failed to fetch' || e.message === 'Load failed') throw new Error('无法连接 Sidecar 服务');
      throw e;
    }
  }
};

// 保持向后兼容：API.delete 指向 API.del
API.delete = API.del;
