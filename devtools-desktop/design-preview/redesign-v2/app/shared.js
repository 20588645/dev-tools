/* DevTools 全新设计 · 方案 B 共享脚本：侧栏注入 / 主题 / 弹窗 / 折叠 / Toast */
(function () {
  // ---------- 主题（localStorage 持久化） ----------
  const saved = localStorage.getItem('proto-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  window.toggleTheme = function () {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('proto-theme', next);
  };

  // ---------- 侧栏 ----------
  const icons = {
    home: '<path d="M2 8.5 8 3l6 5.5M4 7.5V13h8V7.5"/>',
    run: '<path d="M4 3.5 12 8l-8 4.5z"/>',
    deploy: '<path d="M8 2v8m0 0 3-3M8 10 5 7M2.5 12.5h11"/>',
    filetransfer: '<path d="M2.5 5.5h11v8h-11zM5 5.5v-2h6v2"/>',
    editor: '<path d="m10.5 3.5 2 2L6 12l-2.6.6L4 10zM9 5l2 2"/>',
    terminal: '<path d="m3 4 3.5 3.5L3 11M8 12h5"/>',
    todo: '<path d="M3 4.5h10M3 8h10M3 11.5h6"/>',
    notes: '<path d="M4 2.5h8v11H4zM6 5.5h4M6 8h4"/>',
    notebook: '<path d="M3.5 3h7l2 2v8h-9zM10.5 3v2h2"/>',
    ipcheck: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c3 3 3 8 0 11-3-3-3-8 0-11z"/>',
    twofa: '<rect x="3.5" y="6.5" width="9" height="7" rx="1"/><path d="M5.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>',
    usage: '<path d="M3 13V7m5 6V3m5 10V9"/>',
    settings: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8 9 3.6l2-.4.6 2 2 .6-.4 2 1.8 1-1.8 1 .4 2-2 .6-.6 2-2-.4-1 1.8-1-1.8-2 .4-.6-2-2-.6.4-2L1.8 8l1.8-1-.4-2 2-.6.6-2 2 .4z"/>',
  };
  const groups = [
    ['工作台', [
      ['home', '应用首页', 'home.html', ''],
      ['run', '本地运行', 'run.html', '3'],
      ['deploy', '部署面板', 'deploy-dashboard.html', ''],
    ]],
    ['文件与终端', [
      ['filetransfer', '文件传输', 'filetransfer.html', ''],
      ['editor', '文件编辑', 'editor.html', ''],
      ['terminal', '快捷命令', 'terminal.html', '14'],
    ]],
    ['记录', [
      ['todo', '待办事项', 'todo.html', '5'],
      ['notes', '工时内容', 'notes.html', ''],
      ['notebook', '个人笔记', 'notebook.html', ''],
    ]],
    ['工具', [
      ['ipcheck', '纯净检测', 'ipcheck.html', ''],
      ['twofa', '双因验证', 'twofa.html', ''],
      ['usage', '用量统计', 'usage.html', ''],
    ]],
    ['系统', [
      ['settings', '系统设置', 'settings.html', ''],
    ]],
  ];
  const file = location.pathname.split('/').pop() || 'home.html';
  const activeKey = file.startsWith('deploy-') ? 'deploy' : file.replace('.html', '');
  const nav = groups.map(([label, items]) => `
    <div class="nav-group">
      <div class="nav-group-label">${label}</div>
      ${items.map(([key, name, href, count]) => `
        <a class="nav-item ${key === activeKey ? 'active' : ''}" href="${href}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">${icons[key]}</svg>
          ${name}${count ? `<span class="count">${count}</span>` : ''}
        </a>`).join('')}
    </div>`).join('');

  document.write(`
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">⌘</div>
        <div class="brand-name">DevTools</div>
        <div class="brand-ver">v2 proto</div>
      </div>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-foot">
        <button class="foot-btn" data-open="#dlg-intro">ⓘ 介绍</button>
        <button class="foot-btn" onclick="toggleTheme()">◐ 外观</button>
      </div>
    </aside>`);

  // ---------- 全局介绍弹窗 + Toast 宿主（DOM 就绪后注入） ----------
  addEventListener('DOMContentLoaded', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="overlay" id="dlg-intro">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">DevTools Desktop</div>
            <div class="modal-sub">个人开发工具集 · 全新设计原型（方案 B · 柔和玻璃）</div>
          </div>
          <div class="modal-body">
            <div style="font-size:13px; line-height:1.8; color:var(--text-2)">
              项目构建、运行、部署与部署历史；本地/远程文件传输与终端；Git 周报、待办、笔记本、个人笔记与文件编辑器；IP 纯净检测、2FA 验证码与 AI 用量统计。<br>
              本原型覆盖全部 13 个页面与关键弹窗，数据均为示意假数据。
            </div>
          </div>
          <div class="modal-foot"><button class="btn primary" data-close>知道了</button></div>
        </div>
      </div>
      <div class="toast-host" id="toastHost"></div>`;
    document.body.appendChild(host);
    bindOverlays(document);
  });

  // ---------- 弹窗助手：data-open="#id" / data-close ----------
  window.bindOverlays = function (root) {
    root.querySelectorAll('[data-open]').forEach(el => {
      el.addEventListener('click', () => {
        const target = document.querySelector(el.getAttribute('data-open'));
        if (target) target.classList.add('open');
      });
    });
    root.querySelectorAll('.overlay').forEach(ov => {
      ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
      ov.querySelectorAll('[data-close]').forEach(btn =>
        btn.addEventListener('click', () => ov.classList.remove('open')));
    });
  };
  addEventListener('DOMContentLoaded', () => bindOverlays(document));

  // ---------- 分组折叠：.group-head[data-group] ----------
  addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.group-head[data-group]').forEach(h => {
      h.addEventListener('click', () => {
        h.classList.toggle('closed');
        const body = document.getElementById(h.dataset.group);
        if (body) body.classList.toggle('hide');
      });
    });
  });

  // ---------- 主题色（accent）切换：氛围色板点击全应用换色 ----------
  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    const l = (max + min) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [h, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  window.setAccent = function (hex, silent) {
    const root = document.documentElement.style;
    const [h, s, l] = hexToHsl(hex);
    const c2 = hslToHex((h + 26) % 360, Math.min(s, 96), Math.min(l + 8, 72));
    root.setProperty('--accent', hex);
    root.setProperty('--accent-2', c2);
    root.setProperty('--accent-grad', 'linear-gradient(135deg, ' + hex + ', ' + c2 + ')');
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    root.setProperty('--accent-weak', 'rgba(' + r + ',' + g + ',' + b + ',.13)');
    localStorage.setItem('proto-accent', hex);
    if (!silent && window.toast) toast('主题色已切换为 ' + hex.toUpperCase() + ' · 全应用生效');
  };
  window.resetAccent = function () {
    ['--accent', '--accent-2', '--accent-grad', '--accent-weak'].forEach(p => document.documentElement.style.removeProperty(p));
    localStorage.removeItem('proto-accent');
    if (window.toast) toast('已恢复默认主题色');
  };
  const savedAccent = localStorage.getItem('proto-accent');
  if (savedAccent) window.setAccent(savedAccent, true);

  // ---------- Toast ----------
  window.toast = function (msg, kind) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (kind === 'err' ? '<span class="ic-err">✕</span>' : '<span class="ic-ok">✓</span>') + msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };
})();
