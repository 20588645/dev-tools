(() => {
  const navPrimary = [
    ['01', '应用首页'], ['02', '本地运行'], ['03', '部署面板'], ['04', '文件传输'],
    ['05', '快捷命令'], ['06', '待办事项'], ['07', '代码周报'], ['08', '工时内容'],
    ['09', '个人笔记'], ['10', '文件编辑']
  ];
  const navTools = [['11', '纯净检测'], ['12', '2FA 验证码'], ['13', '用量统计']];

  const navHtml = (items, active = false) => items.map(([key, label], index) => (
    `<a class="app-nav-item${active && index === 0 ? ' active' : ''}" href="#"${active && index === 0 ? ' aria-current="page"' : ''}><span class="app-nav-key">${key}</span><span>${label}</span></a>`
  )).join('');

  document.querySelectorAll('[data-shared-sidebar]').forEach((sidebar) => {
    sidebar.className = 'app-sidebar';
    sidebar.innerHTML = `
      <div class="app-brand"><span class="app-brand-mark">⌘</span><span>DevTools</span></div>
      <nav class="app-nav" aria-label="主导航">${navHtml(navPrimary, true)}</nav>
      <nav class="app-nav app-nav-tools" aria-label="工具导航">${navHtml(navTools)}</nav>
      <div class="app-sidebar-footer">
        <button class="app-nav-item app-theme-button" type="button" data-theme-toggle><span class="app-nav-key">◐</span><span data-theme-label>切换亮色</span></button>
      </div>`;
  });

  document.querySelectorAll('a[href="#"]').forEach((link) => {
    link.addEventListener('click', (event) => event.preventDefault());
  });

  const themeKey = 'devtools-home-reimagine-theme';
  const body = document.body;
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === 'light' || savedTheme === 'dark') body.dataset.theme = savedTheme;

  const syncTheme = () => {
    document.querySelectorAll('[data-theme-label]').forEach((label) => {
      label.textContent = body.dataset.theme === 'dark' ? '切换亮色' : '切换暗色';
    });
    window.dispatchEvent(new CustomEvent('previewthemechange', { detail: body.dataset.theme }));
  };
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      body.dataset.theme = body.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(themeKey, body.dataset.theme);
      syncTheme();
    });
  });
  syncTheme();

  const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const syncClock = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = time; });
    document.querySelectorAll('[data-date]').forEach((el) => { el.textContent = dateFormatter.format(now); });
    const minutes = now.getHours() * 60 + now.getMinutes();
    const dayProgress = Math.max(0, Math.min(1, (minutes - 5 * 60 - 28) / ((18 * 60 + 6) - (5 * 60 + 28))));
    document.documentElement.style.setProperty('--live-day-progress', dayProgress.toFixed(4));
  };
  syncClock();
  window.setInterval(syncClock, 30000);

  const quotes = [
    '把复杂留给系统，把简单留给自己。',
    '留一点空白，让真正重要的事自然浮现。',
    '把注意力放回此刻，世界会重新变得清晰。'
  ];
  let quoteIndex = 0;
  const quoteNodes = [...document.querySelectorAll('[data-quote]')];
  const rotateQuote = () => {
    quoteIndex = (quoteIndex + 1) % quotes.length;
    quoteNodes.forEach((node) => {
      node.classList.add('is-switching');
      window.setTimeout(() => {
        node.textContent = quotes[quoteIndex];
        node.classList.remove('is-switching');
      }, 170);
    });
  };
  document.querySelectorAll('[data-next-quote]').forEach((button) => button.addEventListener('click', rotateQuote));
  document.querySelectorAll('[data-favorite-quote]').forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.toggle('is-saved');
      button.textContent = button.classList.contains('is-saved') ? '已收藏' : '收藏';
    });
  });
})();
