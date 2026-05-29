// ========== Module: Terminal (快捷命令) ==========
let commandsData = [];

async function loadCommands() {
  try {
    commandsData = await API.get('/api/commands');
  } catch (e) {
    commandsData = [];
  }
  renderCommandGrid();
  loadSudoStatus();
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

  // 显示输出区
  const section = document.getElementById('cmdOutputSection');
  const output = document.getElementById('cmdOutput');
  const title = document.getElementById('cmdOutputTitle');
  section.classList.add('active');
  title.textContent = `执行: ${cmd.name}`;
  output.textContent = '⏳ 执行中...';

  // 禁用按钮
  const card = document.querySelector(`.cmd-card[data-id="${cmdId}"]`);
  const btn = card?.querySelector('.cmd-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 执行中...'; }

  try {
    const result = await API.post('/api/commands/exec', { command: finalCommand });
    output.textContent = result.output || '(无输出)';
    if (!result.success) {
      output.textContent = '❌ ' + (result.output || '执行失败');
    }
  } catch (err) {
    output.textContent = '❌ 请求失败: ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ 执行'; }
  }
}

function closeCmdOutput() {
  document.getElementById('cmdOutputSection').classList.remove('active');
}

async function showAddCommand() {
  // 使用自定义弹窗，一次性收集所有字段
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
