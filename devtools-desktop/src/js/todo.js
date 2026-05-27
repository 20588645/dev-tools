// ========== Module: Todo (待办看板) ==========

let todosData = [];
let todoLoaded = false;

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
      list.innerHTML = groups[status].map(t => renderTodoCard(t)).join('');
    }
  });
}

function renderTodoCard(todo) {
  const timeAgoStr = getTimeAgo(todo.createdAt);
  const statusClass = 'todo-card-' + todo.status;

  let actions = '';
  const editBtn = `<button class="todo-btn-move todo-btn-back" onclick="event.stopPropagation();editTodo('${todo.id}')" title="编辑">✎</button>`;
  if (todo.status === 'todo') {
    actions = `${editBtn}
      <button class="todo-btn-move todo-btn-start" onclick="moveTodo('${todo.id}','next')" title="开始">▶ 开始</button>
      <button class="todo-btn-delete" onclick="deleteTodo('${todo.id}')" title="删除">✕</button>`;
  } else if (todo.status === 'doing') {
    actions = `${editBtn}
      <button class="todo-btn-move todo-btn-back" onclick="moveTodo('${todo.id}','prev')" title="退回待办">↩</button>
      <button class="todo-btn-move todo-btn-done" onclick="moveTodo('${todo.id}','next')" title="完成">✓ 完成</button>
      <button class="todo-btn-delete" onclick="deleteTodo('${todo.id}')" title="删除">✕</button>`;
  } else {
    actions = `${editBtn}
      <button class="todo-btn-move todo-btn-back" onclick="moveTodo('${todo.id}','prev')" title="退回进行中">↩</button>
      <button class="todo-btn-delete" onclick="deleteTodo('${todo.id}')" title="删除">✕</button>`;
  }

  const titleClass = 'todo-card-title';
  const doneIcon = todo.status === 'done' ? '<span class="todo-done-icon">✓</span>' : '';
  
  const { desc, checklist } = parseTodoContent(todo.content);
  let innerContentHtml = '';
  if (desc) {
    innerContentHtml += `<div class="todo-card-desc-text">${escapeHtml(desc)}</div>`;
  }
  if (checklist.length > 0) {
    const doneCount = checklist.filter(item => item.done).length;
    const progressPercent = Math.round((doneCount / checklist.length) * 100);
    innerContentHtml += `
      <div class="todo-card-checklist-container">
        <div class="todo-card-checklist-progress">
          <div class="todo-progress-bar" style="width: ${progressPercent}%"></div>
          <span class="todo-progress-text">${doneCount}/${checklist.length}</span>
        </div>
        <div class="todo-card-checklist-items">
          ${checklist.slice(0, 5).map((item, idx) => `
            <div class="todo-card-checklist-item ${item.done ? 'done' : ''}" onclick="event.stopPropagation(); toggleSubtask('${todo.id}', ${idx})">
              <span class="todo-item-check-icon">${item.done ? '✓' : ''}</span>
              <span class="todo-item-text">${escapeHtml(item.text)}</span>
            </div>
          `).join('')}
          ${checklist.length > 5 ? `<div class="todo-checklist-more-hint">还有 ${checklist.length - 5} 项...</div>` : ''}
        </div>
      </div>
    `;
  }
  
  const contentHtml = innerContentHtml
    ? `<div class="todo-card-content">${innerContentHtml}</div>`
    : '';
    
  const remindHtml = todo.remindAt
    ? `<span class="todo-card-remind">⏰ ${new Date(todo.remindAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>`
    : '';

  return `
    <div class="todo-card ${statusClass}" data-id="${todo.id}">
      <div class="${titleClass}">${doneIcon}${escapeHtml(todo.title)}</div>
      ${contentHtml}
      <div class="todo-card-footer">
        <span class="todo-card-time">${remindHtml}${timeAgoStr}</span>
        <div class="todo-card-actions">${actions}</div>
      </div>
    </div>
  `;
}

async function moveTodo(id, direction) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;

  const flow = ['todo', 'doing', 'done'];
  const currentIdx = flow.indexOf(todo.status);
  const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
  if (nextIdx < 0 || nextIdx >= flow.length) return;

  const newStatus = flow[nextIdx];
  try {
    await API.put('/api/todos/' + id, { status: newStatus });
    todo.status = newStatus;
    todo.updatedAt = new Date().toISOString();
    renderTodoBoard();
  } catch (err) {
    showToast('⚠️ 移动失败', err.message);
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
          <div class="todo-form-group content-group">
            <label class="todo-field-label">详细描述 (可选)</label>
            <textarea id="addTodoContent" class="todo-content-textarea" placeholder="在此填写详细内容，支持换行和多行输入..." rows="3"></textarea>
          </div>
          <div class="todo-form-group checklist-group">
            <div class="todo-checklist-header">
              <label class="todo-field-label">子任务清单</label>
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
      renderChecklistEditor('addTodoChecklistList', []);
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
      const desc = document.getElementById('addTodoContent')?.value?.trim();
      const checklist = getChecklistValues('addTodoChecklistList');
      const remindAt = getRemindValue('addRemindPicker');
      if (!title) { showToast('⚠️ 标题不能为空'); return; }
      const content = serializeTodoContent(desc, checklist);
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
    renderTodoBoard();
    showToast('✅ 任务已创建');
  } catch (err) {
    showToast('⚠️ 创建失败', err.message);
  }
}

async function editTodo(id) {
  const todo = todosData.find(t => t.id === id);
  if (!todo) return;

  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    const dialogIcon = document.getElementById('sysDialogIcon');
    if (dialogIcon) {
      dialogIcon.innerHTML = `<svg class="todo-modal-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    }
    document.getElementById('sysDialogMsg').textContent = '编辑任务';
    document.getElementById('sysDialogBtns').innerHTML = `
      <div class="todo-form-container double-column">
        <div class="todo-form-main">
          <div class="todo-form-group">
            <label class="todo-field-label">任务标题</label>
            <input type="text" id="editTodoTitle" class="todo-title-input" placeholder="输入任务名称..." value="${escapeAttr(todo.title)}">
          </div>
          <div class="todo-form-group content-group">
            <label class="todo-field-label">详细描述 (可选)</label>
            <textarea id="editTodoContent" class="todo-content-textarea" placeholder="在此填写详细内容，支持换行和多行输入..." rows="3"></textarea>
          </div>
          <div class="todo-form-group checklist-group">
            <div class="todo-checklist-header">
              <label class="todo-field-label">子任务清单</label>
              <button type="button" class="todo-add-item-btn" onclick="addChecklistItemDOM('editRemindPicker')">+ 添加子项</button>
            </div>
            <div class="todo-checklist-items-list" id="editTodoChecklistList"></div>
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
            
            <div class="remind-picker" id="editRemindPicker">
              <div class="remind-quick-btns">
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',0)">今天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',1)">明天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',2)">后天</button>
                <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',7)">下周</button>
              </div>
              
              <div class="custom-date-container">
                <div class="custom-date-trigger" onclick="toggleCalendarPopover('editRemindPicker')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remind-calendar-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <span class="custom-date-value">选择日期...</span>
                </div>
                <div class="custom-calendar-popover" style="display:none"></div>
              </div>
              
              <div class="remind-time-row-vertical">
                <div class="custom-time-container">
                  <div class="custom-time-trigger" onclick="toggleTimePopover('editRemindPicker')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remind-clock-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span class="custom-time-value">12:00</span>
                  </div>
                  <div class="custom-time-popover" style="display:none"></div>
                </div>
                <button type="button" class="remind-quick-btn remind-clear-btn" onclick="clearRemind('editRemindPicker')">清除</button>
              </div>
              
              <div style="display:none">
                <select class="remind-hour" id="editRemindHour"></select>
                <select class="remind-minute" id="editRemindMinute"></select>
              </div>
              
              <div class="remind-display-wrapper">
                <span class="remind-date-display" id="editRemindDisplay">未设置</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="todo-dialog-footer">
        <button class="sys-btn-cancel" id="sysCancel">取消</button>
        <button class="sys-btn-confirm" id="sysOk">保存</button>
      </div>
    `;
    overlay.classList.add('active');
    overlay.classList.add('todo-dialog-overlay');
    setTimeout(() => { 
      document.getElementById('editTodoTitle')?.focus(); 
      initRemindPicker('editRemindPicker', todo.remindAt || ''); 
      const parsed = parseTodoContent(todo.content || '');
      const descEl = document.getElementById('editTodoContent');
      if (descEl) descEl.value = parsed.desc;
      renderChecklistEditor('editTodoChecklistList', parsed.checklist);
    }, 50);

    const cleanup = (val) => {
      overlay.classList.remove('active');
      overlay.classList.remove('todo-dialog-overlay');
      activeSysDialogClose = null;
      resolve(val);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => {
      const title = document.getElementById('editTodoTitle')?.value?.trim();
      const desc = document.getElementById('editTodoContent')?.value?.trim();
      const checklist = getChecklistValues('editTodoChecklistList');
      const remindAt = getRemindValue('editRemindPicker');
      if (!title) { showToast('⚠️ 标题不能为空'); return; }
      const content = serializeTodoContent(desc, checklist);
      cleanup({ title, content, remindAt: remindAt ? new Date(remindAt).toISOString() : '' });
    };
  }).then(async result => {
    if (!result) return;
    try {
      await API.put('/api/todos/' + id, { title: result.title, content: result.content, remindAt: result.remindAt });
      todo.title = result.title;
      todo.content = result.content;
      todo.remindAt = result.remindAt;
      renderTodoBoard();
    } catch (err) {
      showToast('⚠️ 保存失败', err.message);
    }
  });
}

async function deleteTodo(id) {
  const confirmed = await showConfirm('确定删除这个任务？', { icon: '🗑', confirmText: '删除', danger: true });
  if (!confirmed) return;
  try {
    await API.del('/api/todos/' + id);
    todosData = todosData.filter(t => t.id !== id);
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
  const desc = parts[0] || '';
  const checklistStr = parts[1] || '';
  
  const checklist = [];
  if (checklistStr) {
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
  } else {
    // 兼容可能直接在正文中写 markdown 列表的老数据
    const lines = contentStr.split('\n');
    const newLines = [];
    lines.forEach(line => {
      const match = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (match) {
        checklist.push({
          done: match[1].toLowerCase() === 'x',
          text: match[2].trim()
        });
      } else {
        newLines.push(line);
      }
    });
    if (checklist.length > 0) {
      return { desc: newLines.join('\n').trim(), checklist };
    }
  }
  
  return { desc: desc.trim(), checklist };
}

// 序列化普通描述和子任务为 content 字符串
function serializeTodoContent(desc, checklist) {
  const cleanDesc = (desc || '').trim();
  if (!checklist || checklist.length === 0) return cleanDesc;
  
  const checklistStr = checklist
    .map(item => `- [${item.done ? 'x' : ' '}] ${(item.text || '').trim()}`)
    .filter(line => line.length > 0) // 过滤掉空内容的子项
    .join('\n');
    
  if (!checklistStr) return cleanDesc;
  return `${cleanDesc}\n\n[checklist]\n${checklistStr}`;
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
      <input type="text" class="todo-editor-item-input" value="${escapeAttr(item.text)}" placeholder="输入子任务内容... (按回车添加新行)" onkeydown="handleChecklistInputKey(event, this)">
      <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
    </div>
  `).join('');
}

// 处理回车新建下一个子任务输入并聚焦
function handleChecklistInputKey(event, inputEl) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const itemEl = inputEl.closest('.todo-editor-checklist-item');
    
    const newItem = document.createElement('div');
    newItem.className = 'todo-editor-checklist-item';
    newItem.innerHTML = `
      <div class="todo-editor-item-checkbox" onclick="toggleEditorChecklistItem(this)"></div>
      <input type="text" class="todo-editor-item-input" value="" placeholder="输入子任务内容... (按回车添加新行)" onkeydown="handleChecklistInputKey(event, this)">
      <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
    `;
    
    itemEl.after(newItem);
    newItem.querySelector('.todo-editor-item-input').focus();
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
    <input type="text" class="todo-editor-item-input" value="" placeholder="输入子任务内容... (按回车添加新行)" onkeydown="handleChecklistInputKey(event, this)">
    <button type="button" class="todo-editor-item-delete" onclick="deleteChecklistItemDOM(this)" title="删除">✕</button>
  `;
  listEl.appendChild(newItem);
  newItem.querySelector('.todo-editor-item-input').focus();
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
    const text = itemEl.querySelector('.todo-editor-item-input').value.trim();
    if (text) {
      const done = itemEl.querySelector('.todo-editor-item-checkbox').classList.contains('checked');
      items.push({ text, done });
    }
  });
  return items;
}

// 快速切换卡片上的子任务状态，并推送到后端
async function toggleSubtask(todoId, index) {
  const todo = todosData.find(t => t.id === todoId);
  if (!todo) return;
  
  const { desc, checklist } = parseTodoContent(todo.content);
  if (checklist[index]) {
    checklist[index].done = !checklist[index].done;
    const newContent = serializeTodoContent(desc, checklist);
    
    try {
      await API.put('/api/todos/' + todoId, { content: newContent });
      todo.content = newContent;
      renderTodoBoard();
    } catch (err) {
      showToast('⚠️ 更新子任务失败', err.message);
    }
  }
}
