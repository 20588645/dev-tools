// ========== Module: Terminal (快捷命令 + macOS 终端面板 + 多标签页) ==========
let commandsData = [];
let terminalTabs = []; // [{ id, name, term, fitAddon, container }]
let activeTabId = null;

async function loadCommands() {
  try {
    commandsData = await API.get('/api/commands');
  } catch (e) {
    commandsData = [];
  }
  renderCommandGrid();
  loadSudoStatus();
  
  // 仅在首次进入或标签页为空时进行初始化，防止切换页面时终端被断开清空
  if (terminalTabs.length === 0) {
    initTerminalTabs();
  } else {
    // 页面切回时为当前激活的 Tab 重新调整大小并聚焦
    setTimeout(() => {
      if (activeTabId) {
        const activeTab = terminalTabs.find(t => t.id === activeTabId);
        if (activeTab) {
          try {
            activeTab.fitAddon.fit();
            activeTab.term.focus();
          } catch (e) {}
        }
      }
    }, 50);
  }
}

async function loadSudoStatus() {
  try {
    const result = await API.get('/api/commands/sudo-status');
    const status = document.getElementById('cmdSudoStatus');
    if (status) {
      status.textContent = result.configured ? '✅ 已配置' : '⚠️ 未配置';
      status.style.color = result.configured ? 'var(--success)' : 'var(--warning)';
    }
  } catch (e) {}
}

async function saveSudoPassword() {
  const input = document.getElementById('cmdSudoPassword');
  const password = input?.value || '';

  try {
    await API.post('/api/commands/sudo-password', { password });
    input.value = '';
    showToast(password ? '✅ sudo 密码已保存' : '✅ sudo 密码已清除');
    loadSudoStatus();
  } catch (err) {
    showToast('⚠️ 保存失败', err.message);
  }
}

function renderCommandGrid() {
  const grid = document.getElementById('cmdGrid');
  if (!grid) return;

  if (commandsData.length === 0) {
    grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;grid-column:1/-1">暂无命令，点击「+ 添加命令」开始</div>';
    return;
  }

  grid.innerHTML = commandsData.map(cmd => {
    const paramInput = cmd.hasParam
      ? `<div class="cmd-card-param"><input type="text" id="param-${cmd.id}" placeholder="${escapeAttr(cmd.paramPlaceholder || cmd.paramName || '参数')}" value="${escapeAttr(cmd.paramDefault || '')}"></div>`
      : '<div class="cmd-card-param cmd-card-param-spacer"></div>';

    return `
      <div class="cmd-card" data-id="${cmd.id}">
        <button class="cmd-card-delete" onclick="deleteCommand('${cmd.id}')" title="删除">✕</button>
        <div class="cmd-card-header">
          <div class="cmd-card-icon">${cmd.icon || '⚡'}</div>
          <div class="cmd-card-name">${escapeHtml(cmd.name)}</div>
        </div>
        <div class="cmd-card-command" title="${escapeAttr(cmd.command)}">${escapeHtml(cmd.command)}</div>
        ${paramInput}
        <div class="cmd-card-actions">
          <button class="cmd-run-btn" onclick="executeCommand('${cmd.id}')">▶ 执行</button>
        </div>
      </div>
    `;
  }).join('');
}

// 多标签终端初始化与管理
function initTerminalTabs() {
  const container = document.getElementById('terminal-container');
  if (!container) return;

  // 清空多标签 DOM
  container.innerHTML = '';
  terminalTabs = [];
  activeTabId = null;

  // 新建默认标签页
  createNewTerminalTab();

  // 绑定全局 Command+T 键盘快捷键
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(e) {
  const terminalPage = document.getElementById('page-terminal');
  if (!terminalPage || !terminalPage.classList.contains('active')) return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    createNewTerminalTab();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    const panel = document.querySelector('#page-terminal .terminal-panel-area');
    if (panel && panel.classList.contains('fullscreen')) {
      e.preventDefault();
      showTerminalSearch();
    }
  } else if (e.key === 'Escape') {
    const panel = document.querySelector('#page-terminal .terminal-panel-area');
    if (panel && panel.classList.contains('fullscreen')) {
      const searchBar = document.getElementById('terminalSearchBar');
      if (searchBar && searchBar.classList.contains('active')) {
        // 若搜索栏开启，优先关闭搜索栏
        e.preventDefault();
        closeTerminalSearch();
      } else {
        // 否则退出全屏
        e.preventDefault();
        toggleTerminalFullscreen();
      }
    }
  }
}

// 创建新终端标签页
function createNewTerminalTab() {
  const tabId = 'term-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const container = document.getElementById('terminal-container');
  if (!container) return;

  // 1. 创建终端实例包装容器
  const tabWrapper = document.createElement('div');
  tabWrapper.id = 'term-wrapper-' + tabId;
  tabWrapper.className = 'terminal-instance-wrapper';
  tabWrapper.style.width = '100%';
  tabWrapper.style.height = '100%';
  tabWrapper.style.display = 'none'; // 默认隐藏
  container.appendChild(tabWrapper);

  // 2. 初始化 xterm 实例
  const currentTheme = document.body.getAttribute('data-theme') || 'dark';
  const termBg = currentTheme === 'light' ? '#f8fafc' : '#0c1017';
  const termFg = currentTheme === 'light' ? '#0f172a' : '#aab6c5';
  const termCursor = currentTheme === 'light' ? '#0f172a' : '#edf2f8';

  const term = new Terminal({
    cursorBlink: true,
    allowProposedApi: true,
    fontFamily: '"SF Mono", Menlo, Monaco, Consolas, "JetBrains Mono", monospace',
    fontSize: 12,
    theme: {
      background: termBg,
      foreground: termFg,
      cursor: termCursor,
      selectionBackground: currentTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(47, 115, 246, 0.3)',
      black: '#000000',
      red: '#ff5d6c',
      green: '#33d17a',
      yellow: '#f7b955',
      blue: '#7d74f7',
      magenta: '#f3e8ff',
      cyan: '#06b6d4',
      white: '#edf2f8'
    }
  });

  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);

  const search = new SearchAddon.SearchAddon();
  term.loadAddon(search);

  // 监听搜索结果变化，更新计数器 DOM
  search.onDidChangeResults(results => {
    if (activeTabId === tabId) {
      const countSpan = document.getElementById('termSearchCount');
      if (countSpan) {
        if (results && results.resultCount > 0) {
          countSpan.textContent = `${results.resultIndex + 1}/${results.resultCount}`;
        } else {
          countSpan.textContent = '0/0';
        }
      }
    }
  });

  term.open(tabWrapper);

  // 3. 监听输入数据发送给后端
  term.onData(data => {
    sendWSMessage('terminal-input', { terminalId: tabId, data });
  });

  // 4. 保存到列表
  const newTabNumber = terminalTabs.length + 1;
  const newTab = {
    id: tabId,
    name: `Terminal ${newTabNumber}`,
    term,
    fitAddon: fit,
    searchAddon: search,
    container: tabWrapper
  };
  terminalTabs.push(newTab);

  // 5. 渲染标签栏并切换到新标签
  renderTabsUI();
  switchTerminalTab(tabId);

  // 6. 初始化后端 Shell
  setTimeout(() => {
    try {
      fit.fit();
      sendWSMessage('terminal-init', {
        terminalId: tabId,
        cols: term.cols,
        rows: term.rows,
        cwd: ''
      });
    } catch (e) {
      console.error('[Terminal] Init fit error:', e);
    }
  }, 100);
}

// 切换标签页
function switchTerminalTab(tabId) {
  if (activeTabId === tabId) return;
  activeTabId = tabId;

  // 1. 更新容器可见性与大小适配
  terminalTabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.container.style.display = 'block';
      setTimeout(() => {
        try {
          tab.fitAddon.fit();
          tab.term.focus();
        } catch (e) {}
      }, 30);
    } else {
      tab.container.style.display = 'none';
    }
  });

  // 2. 渲染 UI
  renderTabsUI();
  updateTermStatusDot('connected');
}

// 关闭标签页
function closeTerminalTab(tabId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  // 找到需要关闭的 Tab
  const tabIndex = terminalTabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const targetTab = terminalTabs[tabIndex];

  // 1. 发送关闭指令并销毁实例
  sendWSMessage('terminal-close', { terminalId: tabId });
  try {
    targetTab.term.dispose();
  } catch (e) {}
  if (targetTab.container && targetTab.container.parentNode) {
    targetTab.container.parentNode.removeChild(targetTab.container);
  }

  // 2. 从列表中移除
  terminalTabs.splice(tabIndex, 1);

  // 3. 处理后续焦点切换
  if (terminalTabs.length === 0) {
    // 如果全关了，重新创建一个新 Tab
    createNewTerminalTab();
  } else if (activeTabId === tabId) {
    // 如果关掉的是当前激活的 Tab，自动切换到下一个可用 Tab
    const nextActiveIndex = Math.min(tabIndex, terminalTabs.length - 1);
    switchTerminalTab(terminalTabs[nextActiveIndex].id);
  } else {
    // 重新渲染 Tab UI
    renderTabsUI();
  }
}

// 渲染标签页栏 UI
function renderTabsUI() {
  const container = document.getElementById('terminalTabs');
  if (!container) return;

  container.innerHTML = terminalTabs.map((tab, idx) => {
    const isActive = tab.id === activeTabId ? 'active' : '';
    // 如果只剩下一个标签页，不显示关闭按钮
    const closeBtn = terminalTabs.length > 1
      ? `<span class="terminal-tab-close" onclick="closeTerminalTab('${tab.id}', event)">✕</span>`
      : '';

    return `
      <div class="terminal-tab ${isActive}" onclick="switchTerminalTab('${tab.id}')">
        <span class="terminal-tab-title">${escapeHtml(tab.name)}</span>
        ${closeBtn}
      </div>
    `;
  }).join('');
}

// 终端大小变化事件处理
function handleTermResize() {
  if (!activeTabId) return;
  const activeTab = terminalTabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  try {
    activeTab.fitAddon.fit();
    const { cols, rows } = activeTab.term;
    sendWSMessage('terminal-resize', { terminalId: activeTabId, cols, rows });
  } catch (e) {}
}

// 监听窗口缩放事件
window.removeEventListener('resize', handleTermResize);
window.addEventListener('resize', handleTermResize);

function updateTermStatusDot(status) {
  const dot = document.getElementById('termStatusDot');
  if (!dot) return;
  dot.className = 'terminal-status-dot ' + status;
}

function sendWSMessage(type, data) {
  if (WS.socket && WS.socket.readyState === 1) {
    WS.socket.send(JSON.stringify({ type, data }));
  } else {
    updateTermStatusDot('disconnected');
  }
}

// 清除当前激活终端屏幕
function clearTerminal() {
  if (!activeTabId) return;
  const activeTab = terminalTabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.term.clear();
    sendWSMessage('terminal-input', { terminalId: activeTabId, data: 'clear\r' });
  }
}

// 重启当前激活的终端 Shell
function reconnectTerminal() {
  if (!activeTabId) return;
  const activeTab = terminalTabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.term.clear();
    activeTab.term.write('\x1b[33mReconnecting and spawning new shell...\x1b[0m\r\n');
    sendWSMessage('terminal-init', {
      terminalId: activeTabId,
      cols: activeTab.term.cols,
      rows: activeTab.term.rows,
      cwd: ''
    });
    updateTermStatusDot('connected');
  }
}

// 快捷命令执行对接
async function executeCommand(cmdId) {
  const cmd = commandsData.find(c => c.id === cmdId);
  if (!cmd) return;

  let finalCommand = cmd.command;

  // 替换参数
  if (cmd.hasParam && cmd.paramName) {
    const input = document.getElementById('param-' + cmdId);
    const paramValue = input?.value?.trim() || cmd.paramDefault || '';
    if (!paramValue) {
      showToast('⚠️ 请填写参数', cmd.paramPlaceholder || cmd.paramName);
      input?.focus();
      return;
    }
    finalCommand = finalCommand.replace(new RegExp('\\$\\{' + cmd.paramName + '\\}', 'g'), paramValue);
  }

  // 确保终端处于可用状态
  if (!activeTabId || !WS.socket || WS.socket.readyState !== 1) {
    showToast('⚠️ 终端未连接或未就绪');
    return;
  }

  // 发送指令到当前激活的 PTY 终端并回车执行
  sendWSMessage('terminal-input', { terminalId: activeTabId, data: finalCommand + '\r' });
  showToast('⚡ 命令已发送至终端', cmd.name);
}

// 接收 WebSocket 广播消息数据
WS.on('terminal-output', (payload) => {
  if (!payload) return;
  const { terminalId, data } = payload;
  const targetTab = terminalTabs.find(t => t.id === terminalId);
  if (targetTab) {
    targetTab.term.write(data);
  }
});

WS.on('terminal-exit', (payload) => {
  if (!payload) return;
  const { terminalId, exitCode } = payload;
  const targetTab = terminalTabs.find(t => t.id === terminalId);
  if (targetTab) {
    targetTab.term.write(`\r\n\r\n\x1b[31mSession closed (exit code: ${exitCode || 0})\x1b[0m\r\n`);
  }
  if (terminalId === activeTabId) {
    updateTermStatusDot('disconnected');
  }
});

WS.on('open', () => {
  // WebSocket 重新建立连接时，给所有的 Tab 重新发送初始化请求
  terminalTabs.forEach(tab => {
    sendWSMessage('terminal-init', {
      terminalId: tab.id,
      cols: tab.term.cols,
      rows: tab.term.rows,
      cwd: ''
    });
  });
  updateTermStatusDot('connected');
});

// 监听主题变化，动态调整 xterm 主题背景色
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'data-theme') {
      const nextTheme = document.body.getAttribute('data-theme') || 'dark';
      const bg = nextTheme === 'light' ? '#f8fafc' : '#0c1017';
      const fg = nextTheme === 'light' ? '#0f172a' : '#aab6c5';
      const cursor = nextTheme === 'light' ? '#0f172a' : '#edf2f8';
      const selection = nextTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(47, 115, 246, 0.3)';
      
      terminalTabs.forEach(tab => {
        if (tab.term) {
          tab.term.options.theme = {
            ...tab.term.options.theme,
            background: bg,
            foreground: fg,
            cursor: cursor,
            selectionBackground: selection
          };
        }
      });
    }
  });
});
observer.observe(document.body, { attributes: true });

// 快捷命令管理交互（弹窗）
async function showAddCommand() {
  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    document.getElementById('sysDialogIcon').textContent = '⚡';
    document.getElementById('sysDialogMsg').textContent = '添加快捷命令';
    document.getElementById('sysDialogBtns').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;width:100%">
        <input type="text" id="addCmdName" class="sys-prompt-input" placeholder="命令名称（如：杀端口进程）">
        <input type="text" id="addCmdCommand" class="sys-prompt-input" placeholder="Shell 命令（支持 \${param} 占位符）">
        <input type="text" id="addCmdIcon" class="sys-prompt-input" placeholder="图标 emoji（默认 ⚡）" value="⚡">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="sys-btn-cancel" id="sysCancel">取消</button>
        <button class="sys-btn-confirm" id="sysOk">添加</button>
      </div>
    `;
    overlay.classList.add('active');
    setTimeout(() => document.getElementById('addCmdName')?.focus(), 50);

    const cleanup = (result) => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve(result);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => {
      const name = document.getElementById('addCmdName')?.value?.trim();
      const command = document.getElementById('addCmdCommand')?.value?.trim();
      const icon = document.getElementById('addCmdIcon')?.value?.trim() || '⚡';
      if (!name || !command) {
        showToast('⚠️ 名称和命令不能为空');
        return;
      }
      cleanup({ name, command, icon });
    };
  }).then(result => {
    if (!result) return;
    const { name, command, icon } = result;
    const hasParam = command.includes('${');
    let paramName = '';
    let paramPlaceholder = '';
    if (hasParam) {
      const match = command.match(/\$\{(\w+)\}/);
      paramName = match ? match[1] : 'param';
      paramPlaceholder = paramName;
    }
    createCommand({ name, command, icon, hasParam, paramName, paramPlaceholder });
  });
}

async function createCommand(data) {
  try {
    const cmd = await API.post('/api/commands', data);
    commandsData.push(cmd);
    renderCommandGrid();
    showToast('✅ 命令已添加');
  } catch (err) {
    showToast('⚠️ 添加失败', err.message);
  }
}

async function deleteCommand(id) {
  const confirmed = await showConfirm('确定删除这个命令？', { icon: '🗑', confirmText: '删除', danger: true });
  if (!confirmed) return;

  try {
    await API.del('/api/commands/' + id);
    commandsData = commandsData.filter(c => c.id !== id);
    renderCommandGrid();
  } catch (err) {
    showToast('⚠️ 删除失败', err.message);
  }
}

// ========== Terminal Fullscreen & Log Search Functions ==========

function toggleTerminalFullscreen() {
  const panel = document.querySelector('#page-terminal .terminal-panel-area');
  if (!panel) return;

  const isFullscreen = panel.classList.toggle('fullscreen');

  const btnText = document.querySelector('#page-terminal .btn-fullscreen-text');
  const btnIcon = document.querySelector('#page-terminal .icon-fullscreen');

  if (btnText) {
    btnText.textContent = isFullscreen ? '还原' : '全屏';
  }

  if (btnIcon) {
    if (isFullscreen) {
      btnIcon.innerHTML = `<path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"></path>`;
    } else {
      btnIcon.innerHTML = `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>`;
    }
  }

  // 触发所有终端实例重新计算宽度和高度
  setTimeout(() => {
    handleTermResize();
  }, 100);

  // 退出全屏时自动闭合搜索框
  if (!isFullscreen) {
    closeTerminalSearch();
  }
}

function showTerminalSearch() {
  const panel = document.querySelector('#page-terminal .terminal-panel-area');
  if (!panel || !panel.classList.contains('fullscreen')) return;

  const searchBar = document.getElementById('terminalSearchBar');
  if (searchBar) {
    searchBar.classList.add('active');
    const input = document.getElementById('termSearchInput');
    if (input) {
      input.value = '';
      input.focus();
    }
    const countSpan = document.getElementById('termSearchCount');
    if (countSpan) countSpan.textContent = '0/0';
  }
}

function closeTerminalSearch() {
  const searchBar = document.getElementById('terminalSearchBar');
  if (searchBar) {
    searchBar.classList.remove('active');
  }

  // 清理当前激活终端的高亮装饰器
  const activeTab = terminalTabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.searchAddon) {
    try {
      activeTab.searchAddon.clearDecorations();
    } catch (e) {}
  }
  
  // 恢复终端焦点
  const activeTabInst = terminalTabs.find(t => t.id === activeTabId);
  if (activeTabInst && activeTabInst.term) {
    try { activeTabInst.term.focus(); } catch (e) {}
  }
}

function handleTerminalSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    performTerminalSearch(e.shiftKey ? 'prev' : 'next');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeTerminalSearch();
  }
}

function performTerminalSearch(direction = 'next', isIncremental = false) {
  const input = document.getElementById('termSearchInput');
  const query = input?.value || '';
  
  if (!query) {
    const countSpan = document.getElementById('termSearchCount');
    if (countSpan) countSpan.textContent = '0/0';
    
    const activeTab = terminalTabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.searchAddon) {
      try { activeTab.searchAddon.clearDecorations(); } catch (e) {}
    }
    return;
  }

  const activeTab = terminalTabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.searchAddon) return;

  try {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    const searchOptions = {
      incremental: isIncremental,
      caseSensitive: false,
      decorations: currentTheme === 'light' ? {
        // 亮色模式配置：经典的暖橙高亮，配合亮色背景下深色字非常清晰
        activeMatchBackground: '#f7b955',
        activeMatchBorder: '#e2a844',
        matchBackground: 'rgba(247, 185, 85, 0.3)',
        matchBorder: 'rgba(247, 185, 85, 0.5)'
      } : {
        // 暗色模式配置：科技蓝高亮背景，防范命令行浅绿/浅黄高亮字的干扰，提升对比度
        activeMatchBackground: 'rgba(47, 115, 246, 0.85)',
        activeMatchBorder: '#2f73f6',
        matchBackground: 'rgba(47, 115, 246, 0.35)',
        matchBorder: 'rgba(47, 115, 246, 0.55)'
      }
    };

    if (direction === 'next') {
      activeTab.searchAddon.findNext(query, searchOptions);
    } else {
      activeTab.searchAddon.findPrevious(query, searchOptions);
    }
  } catch (err) {
    console.error('[Terminal Search] Error:', err);
  }
}
