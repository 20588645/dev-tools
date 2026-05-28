// ========== Module: Todo (待办看板) ==========

let todosData = [];
let todoLoaded = false;
let selectedTodoId = null;
let collapsedGroups = { todo: false, doing: false, done: false };

async function loadTodos() {
  try {
    todosData = await API.get('/api/todos');
  } catch (e) {
    todosData = [];
  }
  renderTodoBoard();
}

function renderTodoBoard() {
  const groups = { todo: [], doing: [], done: [] };
  todosData.forEach(t => {
    if (groups[t.status]) groups[t.status].push(t);
  });

  ['todo', 'doing', 'done'].forEach(status => {
    const list = document.getElementById('todoList' + status.charAt(0).toUpperCase() + status.slice(1));
    const count = document.getElementById('todoCount' + status.charAt(0).toUpperCase() + status.slice(1));
    if (count) count.textContent = groups[status].length;
    if (list) {
      list.innerHTML = groups[status].map(t => renderTodoRow(t)).join('');
    }
  });

  // 检查选中任务是否存在
  if (selectedTodoId) {
    const exists = todosData.some(t => t.id === selectedTodoId);
    if (!exists) {
      selectedTodoId = null;
      resetDetailPanel();
    } else {
      const activeRow = document.getElementById('todo-task-' + selectedTodoId);
      if (activeRow) activeRow.classList.add('active');
    }
  }
}

function renderTodoRow(todo) {
  const timeAgoStr = getTimeAgo(todo.createdAt);
  const { desc, checklist } = parseTodoContent(todo.content);

  const total = checklist.length;
  const doneCount = checklist.filter(item => item.done).length;
  const isActive = selectedTodoId === todo.id ? 'active' : '';
  const isCompleted = todo.status === 'done' ? 'completed' : '';
  const isDoing = todo.status === 'doing' ? 'doing' : '';

  let checkIcon = '✓';
  if (todo.status === 'doing') {
    checkIcon = '▶';
  }

  let progressHtml = '';
  if (total > 0) {
    const perimeter = 2 * Math.PI * 5; // 31.4
    const percent = doneCount / total;
    const offset = perimeter - (percent * perimeter);
    progressHtml = `
      <div class="todo-progress-ring-container" title="子任务进度: ${doneCount}/${total}">
        <svg class="todo-progress-ring" width="14" height="14">
          <circle stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.8" fill="transparent" r="5" cx="7" cy="7"/>
          <circle class="todo-progress-ring-circle" id="ring-circle-${todo.id}" stroke="var(--primary)" stroke-width="1.8" fill="transparent" r="5" cx="7" cy="7"
                  stroke-dasharray="${perimeter}" stroke-dashoffset="${offset}"/>
        </svg>
        <span class="todo-progress-text" id="ring-text-${todo.id}">${doneCount}/${total}</span>
      </div>
    `;
  }

  let remindHtml = '';
  if (todo.remindAt) {
    const d = new Date(todo.remindAt);
    const dateStr = d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    let pillClass = 'todo-pill-badge';
    const isToday = d.toDateString() === now.toDateString();
    const isOverdue = d.getTime() < now.getTime() && todo.status !== 'done';

    if (isOverdue) {
      pillClass += ' todo-pill-danger';
    } else if (isToday) {
      pillClass += ' todo-pill-warning';
    }

    remindHtml = `
      <div class="todo-meta-divider"></div>
      <span class="${pillClass}">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        ${dateStr}
      </span>
    `;
  }

  return `
    <div class="todo-task-row ${isActive} ${isCompleted} ${isDoing}" id="todo-task-${todo.id}" onclick="selectTodo('${todo.id}')">
      <div class="todo-task-checkbox-circle" onclick="event.stopPropagation(); toggleTodoStatus('${todo.id}')">${checkIcon}</div>
      <div class="todo-task-title-text">${escapeHtml(todo.title)}</div>
      <div class="todo-task-row-meta">
        ${progressHtml}
        ${remindHtml}
        <div class="todo-meta-divider"></div>
        <span class="todo-time-ago">${timeAgoStr}</span>
      </div>
    </div>
  `;
}

function toggleTodoGroup(status) {
  collapsedGroups[status] = !collapsedGroups[status];
  const itemsEl = document.getElementById('todoList' + status.charAt(0).toUpperCase() + status.slice(1));
  const wrapperEl = itemsEl.closest('.todo-group-wrapper');
  if (wrapperEl) {
    const headerEl = wrapperEl.querySelector('.todo-group-header');
    if (collapsedGroups[status]) {
      itemsEl.classList.add('collapsed');
      if (headerEl) headerEl.classList.add('collapsed');
    } else {
      itemsEl.classList.remove('collapsed');
      if (headerEl) headerEl.classList.remove('collapsed');
    }
  }
}

async function toggleTodoStatus(id) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const newStatus = todo.status === 'done' ? 'todo' : 'done';
  try {
    await API.put('/api/todos/' + id, { status: newStatus });
    todo.status = newStatus;
    todo.updatedAt = new Date().toISOString();
    renderTodoBoard();
    if (selectedTodoId === id) {
      selectTodo(id);
    }
  } catch (err) {
    showToast('⚠️ 更新状态失败', err.message);
  }
}

async function selectTodo(id) {
  selectedTodoId = id;
  document.querySelectorAll('.todo-task-row').forEach(row => row.classList.remove('active'));
  const activeRow = document.getElementById('todo-task-' + id);
  if (activeRow) activeRow.classList.add('active');

  const todo = todosData.find(t => t.id === id);
  const panel = document.getElementById('todoDetailPanel');
  if (!todo || !panel) return;

  const statusLabels = {
    todo: '待办',
    doing: '进行中',
    done: '已完成'
  };

  const statusPillClass = `todo-detail-status-pill todo-status-${todo.status}`;
  const { desc, checklist } = parseTodoContent(todo.content);

  const checklistHtml = checklist.map((item, idx) => `
    <div class="todo-detail-checklist-item ${item.done ? 'completed' : ''}" onclick="toggleDetailSubtask('${id}', ${idx})">
      <div class="todo-detail-checklist-check">✓</div>
      <input type="text" class="todo-detail-checklist-text" value="${escapeAttr(item.text)}" 
             onclick="event.stopPropagation()" 
             onchange="updateDetailSubtaskText('${id}', ${idx}, this.value)"
             onkeydown="handleDetailSubtaskKeyDown(event, '${id}', ${idx})">
      <button class="todo-detail-checklist-delete" onclick="event.stopPropagation(); deleteDetailSubtask('${id}', ${idx})" title="删除子任务">✕</button>
    </div>
  `).join('');

  let flowBtnHtml = '';
  if (todo.status === 'todo') {
    flowBtnHtml = `<button class="todo-btn todo-btn-primary" onclick="updateTodoStatus('${id}', 'doing')">▶ 开始执行</button>`;
  } else if (todo.status === 'doing') {
    flowBtnHtml = `
      <button class="todo-btn todo-btn-secondary" onclick="updateTodoStatus('${id}', 'todo')">↩ 退回到待办</button>
      <button class="todo-btn todo-btn-success" onclick="updateTodoStatus('${id}', 'done')">✓ 完成任务</button>
    `;
  } else {
    flowBtnHtml = `<button class="todo-btn todo-btn-secondary" onclick="updateTodoStatus('${id}', 'doing')">↩ 重启任务</button>`;
  }

  panel.innerHTML = `
    <div class="todo-detail-content">
      <div class="todo-detail-header-row">
        <input type="text" class="todo-detail-title-input" value="${escapeAttr(todo.title)}" onchange="updateTodoTitle('${id}', this.value)">
        <span class="${statusPillClass}">${statusLabels[todo.status]}</span>
      </div>

      <div class="todo-detail-section">
        <div class="todo-detail-section-title">任务描述 / 备注</div>
        <div class="todo-detail-desc" contenteditable="true" placeholder="添加描述..." onblur="updateTodoDesc('${id}', this.innerText)">${escapeHtml(desc)}</div>
      </div>

      <div class="todo-detail-section">
        <div class="todo-detail-section-header">
          <div class="todo-detail-section-title">任务清单 / 子步骤</div>
          <button class="todo-detail-add-subtask-btn" onclick="addDetailSubtask('${id}')">+ 添加子项</button>
        </div>
        <div class="todo-detail-checklist" id="todoDetailChecklist">
          ${checklistHtml}
        </div>
      </div>

      <div class="todo-detail-actions-footer">
        <button class="todo-btn todo-btn-danger" onclick="deleteTodo('${id}')">✕ 删除任务</button>
        <div style="display: flex; gap: 8px;">
          ${flowBtnHtml}
        </div>
      </div>
    </div>
  `;
}

function resetDetailPanel() {
  const panel = document.getElementById('todoDetailPanel');
  if (panel) {
    panel.innerHTML = `
      <div class="todo-detail-empty-state">
        <span class="todo-empty-icon">📝</span>
        <span>选择左侧列表中的待办任务以查看或编辑详情</span>
      </div>
    `;
  }
}

async function updateTodoTitle(id, newTitle) {
  newTitle = newTitle.trim();
  if (!newTitle) return;
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  try {
    await API.put('/api/todos/' + id, { title: newTitle });
    todo.title = newTitle;
    const activeRow = document.getElementById('todo-task-' + id);
    if (activeRow) {
      const titleEl = activeRow.querySelector('.todo-task-title-text');
      if (titleEl) titleEl.textContent = newTitle;
    }
  } catch (err) {
    showToast('⚠️ 更新标题失败', err.message);
  }
}

async function updateTodoDesc(id, newDesc) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { checklist } = parseTodoContent(todo.content);
  const newContent = serializeTodoContent(newDesc, checklist);
  try {
    await API.put('/api/todos/' + id, { content: newContent });
    todo.content = newContent;
  } catch (err) {
    showToast('⚠️ 更新描述失败', err.message);
  }
}

async function toggleDetailSubtask(id, idx) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { desc, checklist } = parseTodoContent(todo.content);
  if (checklist[idx]) {
    checklist[idx].done = !checklist[idx].done;
    const newContent = serializeTodoContent(desc, checklist);
    try {
      await API.put('/api/todos/' + id, { content: newContent });
      todo.content = newContent;
      selectTodo(id);
      updateLeftRowMeta(id, checklist);
    } catch (err) {
      showToast('⚠️ 更新子任务失败', err.message);
    }
  }
}

function updateLeftRowMeta(id, checklist) {
  const total = checklist.length;
  const doneCount = checklist.filter(item => item.done).length;
  const ringContainer = document.querySelector(`#todo-task-${id} .todo-progress-ring-container`);
  if (total > 0) {
    if (ringContainer) {
      ringContainer.style.display = 'flex';
      ringContainer.title = `子任务进度: ${doneCount}/${total}`;
      const textLabel = document.getElementById('ring-text-' + id);
      if (textLabel) textLabel.textContent = `${doneCount}/${total}`;

      const circle = document.getElementById('ring-circle-' + id);
      if (circle) {
        const perimeter = 2 * Math.PI * 5;
        const percent = doneCount / total;
        const offset = perimeter - (percent * perimeter);
        circle.style.strokeDasharray = perimeter;
        circle.style.strokeDashoffset = offset;
      }
    } else {
      renderTodoBoard();
    }
  } else {
    if (ringContainer) ringContainer.style.display = 'none';
  }
}

async function updateDetailSubtaskText(id, idx, newText) {
  newText = newText.trim();
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { desc, checklist } = parseTodoContent(todo.content);
  if (checklist[idx]) {
    checklist[idx].text = newText;
    const newContent = serializeTodoContent(desc, checklist);
    try {
      await API.put('/api/todos/' + id, { content: newContent });
      todo.content = newContent;
    } catch (err) {
      showToast('⚠️ 更新子任务内容失败', err.message);
    }
  }
}

async function deleteDetailSubtask(id, idx) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { desc, checklist } = parseTodoContent(todo.content);
  checklist.splice(idx, 1);
  const newContent = serializeTodoContent(desc, checklist);
  try {
    await API.put('/api/todos/' + id, { content: newContent });
    todo.content = newContent;
    selectTodo(id);
    renderTodoBoard();
  } catch (err) {
    showToast('⚠️ 删除子任务失败', err.message);
  }
}

async function addDetailSubtask(id) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { desc, checklist } = parseTodoContent(todo.content);
  checklist.push({ text: '', done: false });
  const newContent = serializeTodoContent(desc, checklist);
  try {
    await API.put('/api/todos/' + id, { content: newContent });
    todo.content = newContent;
    selectTodo(id);
    renderTodoBoard();

    setTimeout(() => {
      const listItems = document.querySelectorAll('#todoDetailChecklist .todo-detail-checklist-text');
      if (listItems.length > 0) {
        const lastInput = listItems[listItems.length - 1];
        lastInput.focus();
      }
    }, 50);
  } catch (err) {
    showToast('⚠️ 添加子任务失败', err.message);
  }
}

function handleDetailSubtaskKeyDown(event, id, idx) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const newText = event.target.value;
    updateDetailSubtaskText(id, idx, newText).then(() => {
      insertSubtaskAfter(id, idx);
    });
  }
}

async function insertSubtaskAfter(id, idx) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  const { desc, checklist } = parseTodoContent(todo.content);
  checklist.splice(idx + 1, 0, { text: '', done: false });
  const newContent = serializeTodoContent(desc, checklist);
  try {
    await API.put('/api/todos/' + id, { content: newContent });
    todo.content = newContent;
    selectTodo(id);
    renderTodoBoard();

    setTimeout(() => {
      const listItems = document.querySelectorAll('#todoDetailChecklist .todo-detail-checklist-text');
      if (listItems[idx + 1]) {
        listItems[idx + 1].focus();
      }
    }, 50);
  } catch (err) {
    showToast('⚠️ 插入子任务失败', err.message);
  }
}

async function updateTodoStatus(id, newStatus) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;
  try {
    await API.put('/api/todos/' + id, { status: newStatus });
    todo.status = newStatus;
    todo.updatedAt = new Date().toISOString();
    renderTodoBoard();
    selectTodo(id);
  } catch (err) {
    showToast('⚠️ 更新状态失败', err.message);
  }
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function showAddTodo() {
  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    const dialogIcon = document.getElementById('sysDialogIcon');
    if (dialogIcon) {
      dialogIcon.innerHTML = `<svg class="todo-modal-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
    }
    document.getElementById('sysDialogMsg').textContent = '新建任务';
    document.getElementById('sysDialogBtns').innerHTML = `
      <div class="todo-form-container double-column">
        <div class="todo-form-main">
          <div class="todo-form-group">
            <label class="todo-field-label">任务标题</label>
            <input type="text" id="addTodoTitle" class="todo-title-input" placeholder="输入任务名称...">
          </div>
          <div class="todo-form-group checklist-group">
            <div class="todo-checklist-header">
              <label class="todo-field-label">任务清单 / 子项目</label>
              <button type="button" class="todo-add-item-btn" onclick="addChecklistItemDOM('addRemindPicker')">+ 添加子项</button>
            </div>
            <div class="todo-checklist-items-list" id="addTodoChecklistList"></div>
          </div>
        </div>
        
        <div class="todo-form-sidebar">
          <div class="todo-remind-section">
            <div class="todo-remind-title-row">
              <span class="todo-remind-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remind-bell-icon"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                提醒设置
              </span>
            </div>
            
            <div class="remind-picker" id="addRemindPicker">
              <div class="remind-quick-btns">
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',0)">今天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',1)">明天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',2)">后天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',7)">下周</button>
              </div>
              
              <div class="custom-date-container">
                <div class="custom-date-trigger" onclick="toggleCalendarPopover('addRemindPicker')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remind-calendar-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <span class="custom-date-value">选择日期...</span>
                </div>
                <div class="custom-calendar-popover" style="display:none"></div>
              </div>
              
              <div class="remind-time-row-vertical">
                <div class="custom-time-container">
                  <div class="custom-time-trigger" onclick="toggleTimePopover('addRemindPicker')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remind-clock-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span class="custom-time-value">12:00</span>
                  </div>
                  <div class="custom-time-popover" style="display:none"></div>
                </div>
                <button type="button" class="remind-quick-btn remind-clear-btn" onclick="clearRemind('addRemindPicker')">清除</button>
              </div>
              
              <div style="display:none">
                <select class="remind-hour" id="addRemindHour"></select>
                <select class="remind-minute" id="addRemindMinute"></select>
              </div>
              
              <div class="remind-display-wrapper">
                <span class="remind-date-display" id="addRemindDisplay">未设置</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="todo-dialog-footer">
        <button class="sys-btn-cancel" id="sysCancel">取消</button>
        <button class="sys-btn-confirm" id="sysOk">创建</button>
      </div>
    `;
    overlay.classList.add('active');
    overlay.classList.add('todo-dialog-overlay');
    setTimeout(() => { 
      document.getElementById('addTodoTitle')?.focus(); 
      initRemindPicker('addRemindPicker', ''); 
      renderChecklistEditor('addTodoChecklistList', [{ text: '', done: false }]);
    }, 50);

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.classList.remove('todo-dialog-overlay');
      activeSysDialogClose = null;
      resolve(result);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => {
      const title = document.getElementById('addTodoTitle')?.value?.trim();
      const checklist = getChecklistValues('addTodoChecklistList');
      const remindAt = getRemindValue('addRemindPicker');
      if (!title) { showToast('⚠️ 标题不能为空'); return; }
      const content = serializeTodoContent('', checklist);
      cleanup({ title, content, remindAt: remindAt ? new Date(remindAt).toISOString() : '' });
    };
    document.getElementById('addTodoTitle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('sysOk').click();
    });
  }).then(result => {
    if (!result) return;
    createTodo(result.title, result.content, result.remindAt);
  });
}

async function createTodo(title, content = '', remindAt = '') {
  try {
    const todo = await API.post('/api/todos', { title, content, status: 'todo', remindAt });
    todosData.unshift(todo);
    selectedTodoId = todo.id;
    renderTodoBoard();
    selectTodo(todo.id);
    showToast('✅ 任务已创建');
  } catch (err) {
    showToast('⚠️ 创建失败', err.message);
  }
}

async function deleteTodo(id) {
  const confirmed = await showConfirm('确定删除这个任务？', { icon: '🗑', confirmText: '删除', danger: true });
  if (!confirmed) return;
  try {
    await API.del('/api/todos/' + id);
    todosData = todosData.filter(t => t.id !== id);
    if (selectedTodoId === id) {
      selectedTodoId = null;
      resetDetailPanel();
    }
    renderTodoBoard();
  } catch (err) {
    showToast('⚠️ 删除失败', err.message);
  }
}

async function clearDoneTodos() {
  const doneCount = todosData.filter(t => t.status === 'done').length;
  if (doneCount === 0) { showToast('ℹ️ 没有已完成的任务'); return; }
  const confirmed = await showConfirm(`确定清除 ${doneCount} 条已完成任务？`, { icon: '🗑', confirmText: '清除', danger: true });
  if (!confirmed) return;
  try {
    await API.delete('/api/todos');
    todosData = todosData.filter(t => t.status !== 'done');
    if (selectedTodoId) {
      const exists = todosData.some(t => t.id === selectedTodoId);
      if (!exists) {
        selectedTodoId = null;
        resetDetailPanel();
      }
    }
    renderTodoBoard();
    showToast('✅ 已清除完成任务');
  } catch (err) {
    showToast('⚠️ 清除失败', err.message);
  }
}

// ========== 待办提醒检查 ==========
let todoRemindedIds = new Set(JSON.parse(localStorage.getItem('devtools-reminded-todos') || '[]'));

function saveTodoRemindedIds() {
  const arr = [...todoRemindedIds];
  if (arr.length > 200) {
    const trimmed = arr.slice(-200);
    todoRemindedIds = new Set(trimmed);
  }
  localStorage.setItem('devtools-reminded-todos', JSON.stringify([...todoRemindedIds]));
}

function startTodoReminderCheck() {
  if (window._todoReminderStarted) return;
  window._todoReminderStarted = true;
  setInterval(checkTodoReminders, 30000);
  setTimeout(checkTodoReminders, 3000);
}

async function checkTodoReminders() {
  let todos;
  try {
    todos = await API.get('/api/todos');
  } catch { return; }

  const now = Date.now();

  for (const todo of todos) {
    if (!todo.remindAt) continue;
    if (todo.status === 'done') continue;
    if (todoRemindedIds.has(todo.id)) continue;

    const remindTime = new Date(todo.remindAt).getTime();
    if (remindTime <= now) {
      todoRemindedIds.add(todo.id);
      saveTodoRemindedIds();
      sendDesktopNotification('⏰ 待办提醒', todo.title + (todo.content ? '\n' + todo.content : ''), false, { target: 'log' });
      showToast('⏰ 待办提醒', todo.title);
    }
  }
}

// 应用启动时开始检查
startTodoReminderCheck();

// ========== 自定义提醒时间选择器 ==========
function initRemindPicker(pickerId, existingDate) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;

  const hourSelect = picker.querySelector('.remind-hour');
  const minuteSelect = picker.querySelector('.remind-minute');
  const display = picker.querySelector('.remind-date-display');
  const dateText = picker.querySelector('.custom-date-value');
  const timeText = picker.querySelector('.custom-time-value');

  hourSelect.innerHTML = Array.from({length: 24}, (_, i) => 
    `<option value="${i}">${String(i).padStart(2,'0')}</option>`
  ).join('');

  minuteSelect.innerHTML = Array.from({length: 12}, (_, i) => 
    `<option value="${i*5}">${String(i*5).padStart(2,'0')}</option>`
  ).join('');

  if (existingDate) {
    const d = new Date(existingDate);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    picker.dataset.date = dateStr;
    if (dateText) dateText.textContent = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    
    const h = d.getHours();
    const m = Math.round(d.getMinutes() / 5) * 5;
    hourSelect.value = h;
    minuteSelect.value = m;
    
    if (timeText) timeText.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    
    updateRemindDisplay(pickerId);
  } else {
    const now = new Date();
    const h = Math.min(now.getHours() + 1, 23);
    const m = 0;
    picker.dataset.date = '';
    hourSelect.value = h;
    minuteSelect.value = m;
    
    if (timeText) timeText.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    if (dateText) dateText.textContent = '选择日期...';
    
    display.textContent = '未设置';
  }

  hourSelect.onchange = () => updateRemindDisplay(pickerId);
  minuteSelect.onchange = () => updateRemindDisplay(pickerId);
}

function setRemindQuick(pickerId, daysFromNow) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  picker.dataset.date = dateStr;
  
  const dateText = picker.querySelector('.custom-date-value');
  if (dateText) dateText.textContent = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  
  updateRemindDisplay(pickerId);
}

function clearRemind(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.dataset.date = '';
  
  const dateText = picker.querySelector('.custom-date-value');
  if (dateText) dateText.textContent = '选择日期...';
  
  const display = picker.querySelector('.remind-date-display');
  if (display) display.textContent = '未设置';
}

function updateRemindDisplay(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const display = picker.querySelector('.remind-date-display');
  const dateStr = picker.dataset.date;
  
  const hour = picker.querySelector('.remind-hour').value;
  const minute = picker.querySelector('.remind-minute').value;
  
  const timeText = picker.querySelector('.custom-time-value');
  if (timeText) {
    timeText.textContent = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }

  if (!dateStr) { display.textContent = '未设置'; return; }
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  display.textContent = `${d.getMonth()+1}/${d.getDate()} ${weekdays[d.getDay()]} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

function getRemindValue(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return '';
  const dateStr = picker.dataset.date;
  if (!dateStr) return '';
  const hour = picker.querySelector('.remind-hour').value;
  const minute = picker.querySelector('.remind-minute').value;
  return `${dateStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

// ========== 全自定义时间日期组件交互 ==========
let calDisplayYear = new Date().getFullYear();
let calDisplayMonth = new Date().getMonth();

function toggleCalendarPopover(pickerId) {
  event.stopPropagation();
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  
  const popover = picker.querySelector('.custom-calendar-popover');
  if (!popover) return;
  
  const isHidden = popover.style.display === 'none';
  closeAllPopovers();
  
  if (isHidden) {
    let d = new Date();
    if (picker.dataset.date) {
      d = new Date(picker.dataset.date + 'T00:00:00');
    }
    calDisplayYear = d.getFullYear();
    calDisplayMonth = d.getMonth();
    
    renderCalendar(pickerId);
    popover.style.display = 'block';
  }
}

function renderCalendar(pickerId) {
  const picker = document.getElementById(pickerId);
  const popover = picker.querySelector('.custom-calendar-popover');
  if (!popover) return;
  
  let selectedDateStr = picker.dataset.date || '';
  const firstDay = new Date(calDisplayYear, calDisplayMonth, 1).getDay();
  const firstDayOfWeek = firstDay === 0 ? 6 : firstDay - 1;
  const totalDays = new Date(calDisplayYear, calDisplayMonth + 1, 0).getDate();
  const prevTotalDays = new Date(calDisplayYear, calDisplayMonth, 0).getDate();
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  
  let html = `
    <div class="cal-header">
      <button type="button" class="cal-btn-prev" onclick="changeCalMonth('${pickerId}',-1)">←</button>
      <span class="cal-title">${calDisplayYear}年 ${monthNames[calDisplayMonth]}</span>
      <button type="button" class="cal-btn-next" onclick="changeCalMonth('${pickerId}',1)">→</button>
    </div>
    <div class="cal-weekdays">
      <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
    </div>
    <div class="cal-days">
  `;
  
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = prevTotalDays - i;
    html += `<span class="cal-day other-month">${day}</span>`;
  }
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${calDisplayYear}-${String(calDisplayMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isSelected = dateStr === selectedDateStr ? 'active' : '';
    const isToday = dateStr === todayStr ? 'today' : '';
    html += `<span class="cal-day ${isSelected} ${isToday}" onclick="selectCalDate('${pickerId}','${dateStr}')">${day}</span>`;
  }
  
  const remaining = 42 - (firstDayOfWeek + totalDays);
  for (let day = 1; day <= remaining; day++) {
    html += `<span class="cal-day other-month">${day}</span>`;
  }
  
  html += `</div>`;
  popover.innerHTML = html;
}

function changeCalMonth(pickerId, val) {
  event.stopPropagation();
  calDisplayMonth += val;
  if (calDisplayMonth < 0) {
    calDisplayMonth = 11;
    calDisplayYear -= 1;
  } else if (calDisplayMonth > 11) {
    calDisplayMonth = 0;
    calDisplayYear += 1;
  }
  renderCalendar(pickerId);
}

function selectCalDate(pickerId, dateStr) {
  event.stopPropagation();
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  
  picker.dataset.date = dateStr;
  const dateText = picker.querySelector('.custom-date-value');
  if (dateText) {
    const d = new Date(dateStr + 'T00:00:00');
    dateText.textContent = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  
  const popover = picker.querySelector('.custom-calendar-popover');
  if (popover) popover.style.display = 'none';
  
  updateRemindDisplay(pickerId);
}

function toggleTimePopover(pickerId) {
  event.stopPropagation();
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  
  const popover = picker.querySelector('.custom-time-popover');
  if (!popover) return;
  
  const isHidden = popover.style.display === 'none';
  closeAllPopovers();
  
  if (isHidden) {
    const isAdd = pickerId.startsWith('add');
    const hourVal = parseInt(document.getElementById(isAdd ? 'addRemindHour' : 'editRemindHour')?.value || '12');
    const minuteVal = parseInt(document.getElementById(isAdd ? 'addRemindMinute' : 'editRemindMinute')?.value || '0');
    
    let html = `
      <div class="time-popover-cols">
        <div class="time-popover-col">
          <div class="time-popover-col-title">时</div>
          <ul>
    `;
    for (let h = 0; h < 24; h++) {
      const activeClass = h === hourVal ? 'active' : '';
      html += `<li class="${activeClass}" onclick="selectTimeVal('${pickerId}','hour',${h})">${String(h).padStart(2,'0')}</li>`;
    }
    html += `
          </ul>
        </div>
        <div class="time-popover-col">
          <div class="time-popover-col-title">分</div>
          <ul>
    `;
    for (let m = 0; m < 12; m++) {
      const min = m * 5;
      const activeClass = min === minuteVal ? 'active' : '';
      html += `<li class="${activeClass}" onclick="selectTimeVal('${pickerId}','minute',${min})">${String(min).padStart(2,'0')}</li>`;
    }
    html += `
          </ul>
        </div>
      </div>
    `;
    
    popover.innerHTML = html;
    popover.style.display = 'block';
    
    setTimeout(() => {
      popover.querySelectorAll('.time-popover-col').forEach(col => {
        const activeItem = col.querySelector('li.active');
        if (activeItem) {
          col.querySelector('ul').scrollTop = activeItem.offsetTop - 50;
        }
      });
    }, 20);
  }
}

function selectTimeVal(pickerId, type, val) {
  event.stopPropagation();
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  
  const selectId = `${pickerId.startsWith('add') ? 'add' : 'edit'}Remind${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const select = document.getElementById(selectId);
  if (select) {
    select.value = val;
  }
  
  const popover = picker.querySelector('.custom-time-popover');
  if (popover) {
    const colIndex = type === 'hour' ? 0 : 1;
    const col = popover.querySelectorAll('.time-popover-col')[colIndex];
    if (col) {
      col.querySelectorAll('li').forEach(li => li.classList.remove('active'));
      const activeLi = Array.from(col.querySelectorAll('li')).find(li => parseInt(li.textContent) === val);
      if (activeLi) activeLi.classList.add('active');
    }
  }
  
  updateRemindDisplay(pickerId);
}

function closeAllPopovers() {
  document.querySelectorAll('.custom-calendar-popover, .custom-time-popover').forEach(el => {
    el.style.display = 'none';
  });
}

document.addEventListener('click', () => {
  closeAllPopovers();
});

// ========== 子项目清单 (Checklist / Subtasks) 核心机制 ==========

// 解析 content 中的普通描述和子任务
function parseTodoContent(contentStr) {
  if (!contentStr) return { desc: '', checklist: [] };

  const parts = contentStr.split('\n[checklist]\n');
  if (parts.length > 1) {
    const desc = parts[0] || '';
    const checklistStr = parts[1] || '';
    const checklist = [];
    if (checklistStr.trim()) {
      const lines = checklistStr.split('\n');
      lines.forEach(line => {
        const match = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
        if (match) {
          checklist.push({
            done: match[1].toLowerCase() === 'x',
            text: match[2].trim()
          });
        }
      });
    }
    return { desc, checklist };
  }

  // 兼容老数据结构 (无分割符，混合存在)
  const lines = contentStr.split('\n');
  const checklist = [];
  const descLines = [];
  lines.forEach(line => {
    const match = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      checklist.push({
        done: match[1].toLowerCase() === 'x',
        text: match[2].trim()
      });
    } else {
      descLines.push(line);
    }
  });
  return { desc: descLines.join('\n'), checklist };
}

// 序列化描述与子步骤
function serializeTodoContent(desc, checklist) {
  const descPart = (desc || '').trim();
  const checklistPart = (checklist || [])
    .map(item => `- [${item.done ? 'x' : ' '}] ${(item.text || '').trim()}`)
    .filter(line => line.length > 6)
    .join('\n');

  if (descPart && checklistPart) {
    return descPart + '\n[checklist]\n' + checklistPart;
  } else if (checklistPart) {
    return '[checklist]\n' + checklistPart;
  } else {
    return descPart;
  }
}

// 自动伸缩文本域高度
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// 渲染弹窗中的子项配置区
function renderChecklistEditor(containerId, checklist) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = (checklist || []).map((item, idx) => `
    <div class="todo-editor-checklist-item">
      <div class="todo-editor-item-checkbox ${item.done ? 'checked' : ''}" onclick="toggleEditorChecklistItem(this)">
        ${item.done ? '✓' : ''}
      </div>
      <textarea class="todo-editor-item-textarea" placeholder="输入任务项内容... (按回车添加新行，Shift+Enter换行)" onkeydown="handleChecklistInputKey(event, this)" oninput="autoGrowTextarea(this)">${escapeHtml(item.text || '')}</textarea>
      <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
    </div>
  `).join('');

  setTimeout(() => {
    container.querySelectorAll('.todo-editor-item-textarea').forEach(el => autoGrowTextarea(el));
  }, 50);
}

// 处理回车新建下一个子任务输入并聚焦
function handleChecklistInputKey(event, textareaEl) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const itemEl = textareaEl.closest('.todo-editor-checklist-item');

    const newItem = document.createElement('div');
    newItem.className = 'todo-editor-checklist-item';
    newItem.innerHTML = `
      <div class="todo-editor-item-checkbox" onclick="toggleEditorChecklistItem(this)"></div>
      <textarea class="todo-editor-item-textarea" placeholder="输入任务项内容... (按回车添加新行，Shift+Enter换行)" onkeydown="handleChecklistInputKey(event, this)" oninput="autoGrowTextarea(this)"></textarea>
      <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
    `;

    itemEl.after(newItem);
    const newTextarea = newItem.querySelector('.todo-editor-item-textarea');
    newTextarea.focus();
    autoGrowTextarea(newTextarea);
  }
}

// 按钮点击添加子任务
function addChecklistItemDOM(pickerId) {
  const isAdd = pickerId.startsWith('add');
  const listId = isAdd ? 'addTodoChecklistList' : 'editTodoChecklistList';
  const listEl = document.getElementById(listId);
  if (!listEl) return;

  const newItem = document.createElement('div');
  newItem.className = 'todo-editor-checklist-item';
  newItem.innerHTML = `
    <div class="todo-editor-item-checkbox" onclick="toggleEditorChecklistItem(this)"></div>
    <textarea class="todo-editor-item-textarea" placeholder="输入任务项内容... (按回车添加新行，Shift+Enter换行)" onkeydown="handleChecklistInputKey(event, this)" oninput="autoGrowTextarea(this)"></textarea>
    <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
  `;
  listEl.appendChild(newItem);
  const newTextarea = newItem.querySelector('.todo-editor-item-textarea');
  newTextarea.focus();
  autoGrowTextarea(newTextarea);
}

// 编辑弹窗内点击勾选框切换
function toggleEditorChecklistItem(checkboxEl) {
  checkboxEl.classList.toggle('checked');
  if (checkboxEl.classList.contains('checked')) {
    checkboxEl.textContent = '✓';
  } else {
    checkboxEl.textContent = '';
  }
}

// 删除子任务 DOM
function deleteChecklistItemDOM(btnEl) {
  const itemEl = btnEl.closest('.todo-editor-checklist-item');
  if (itemEl) itemEl.remove();
}

// 从 DOM 列表中抽取数组
function getChecklistValues(listId) {
  const listEl = document.getElementById(listId);
  if (!listEl) return [];

  const items = [];
  listEl.querySelectorAll('.todo-editor-checklist-item').forEach(itemEl => {
    const textarea = itemEl.querySelector('.todo-editor-item-textarea');
    if (textarea) {
      const text = textarea.value.trim();
      if (text) {
        const done = itemEl.querySelector('.todo-editor-item-checkbox').classList.contains('checked');
        items.push({ text, done });
      }
    }
  });
  return items;
}
