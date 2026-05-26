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
  const contentHtml = todo.content
    ? `<div class="todo-card-content">${escapeHtml(todo.content)}</div>`
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
    document.getElementById('sysDialogIcon').textContent = '📌';
    document.getElementById('sysDialogMsg').textContent = '新建任务';
    document.getElementById('sysDialogBtns').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;width:100%">
        <input type="text" id="addTodoTitle" class="sys-prompt-input" placeholder="任务标题">
        <textarea id="addTodoContent" class="sys-prompt-textarea" placeholder="详细内容（可选）" rows="3"></textarea>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">⏰ 提醒</span>
          <input type="datetime-local" id="addTodoRemind" class="sys-prompt-input" style="flex:1;display:none">
          <div class="remind-picker" id="addRemindPicker">
            <div class="remind-quick-btns">
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',0)">今天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',1)">明天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',2)">后天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('addRemindPicker',7)">下周</button>
              <button type="button" class="remind-quick-btn remind-clear-btn" onclick="clearRemind('addRemindPicker')">清除</button>
            </div>
            <div class="remind-time-row">
              <select class="remind-hour" id="addRemindHour"></select>
              <span style="color:var(--text-muted)">:</span>
              <select class="remind-minute" id="addRemindMinute"></select>
              <span class="remind-date-display" id="addRemindDisplay">未设置</span>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="sys-btn-cancel" id="sysCancel">取消</button>
        <button class="sys-btn-confirm" id="sysOk">创建</button>
      </div>
    `;
    overlay.classList.add('active');
    setTimeout(() => { document.getElementById('addTodoTitle')?.focus(); initRemindPicker('addRemindPicker', ''); }, 50);

    const cleanup = (result) => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve(result);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => {
      const title = document.getElementById('addTodoTitle')?.value?.trim();
      const content = document.getElementById('addTodoContent')?.value?.trim();
      const remindAt = document.getElementById('addTodoRemind')?.value || getRemindValue('addRemindPicker');
      if (!title) { showToast('⚠️ 标题不能为空'); return; }
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

  let remindValue = '';
  if (todo.remindAt) {
    const d = new Date(todo.remindAt);
    remindValue = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return new Promise(resolve => {
    const overlay = document.getElementById('sysDialog');
    document.getElementById('sysDialogIcon').textContent = '✎';
    document.getElementById('sysDialogMsg').textContent = '编辑任务';
    document.getElementById('sysDialogBtns').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;width:100%">
        <input type="text" id="editTodoTitle" class="sys-prompt-input" placeholder="任务标题" value="${escapeAttr(todo.title)}">
        <textarea id="editTodoContent" class="sys-prompt-textarea" placeholder="详细内容（可选）" rows="3">${escapeHtml(todo.content || '')}</textarea>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">⏰ 提醒</span>
          <input type="datetime-local" id="editTodoRemind" class="sys-prompt-input" style="flex:1;display:none" value="${remindValue}">
          <div class="remind-picker" id="editRemindPicker">
            <div class="remind-quick-btns">
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',0)">今天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',1)">明天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',2)">后天</button>
              <button type="button" class="remind-quick-btn" onclick="setRemindQuick('editRemindPicker',7)">下周</button>
              <button type="button" class="remind-quick-btn remind-clear-btn" onclick="clearRemind('editRemindPicker')">清除</button>
            </div>
            <div class="remind-time-row">
              <select class="remind-hour" id="editRemindHour"></select>
              <span style="color:var(--text-muted)">:</span>
              <select class="remind-minute" id="editRemindMinute"></select>
              <span class="remind-date-display" id="editRemindDisplay">未设置</span>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="sys-btn-cancel" id="sysCancel">取消</button>
        <button class="sys-btn-confirm" id="sysOk">保存</button>
      </div>
    `;
    overlay.classList.add('active');
    setTimeout(() => { document.getElementById('editTodoTitle')?.focus(); initRemindPicker('editRemindPicker', todo.remindAt || ''); }, 50);

    const cleanup = (val) => {
      overlay.classList.remove('active');
      activeSysDialogClose = null;
      resolve(val);
    };
    activeSysDialogClose = () => cleanup(null);
    document.getElementById('sysCancel').onclick = () => cleanup(null);
    document.getElementById('sysOk').onclick = () => {
      const title = document.getElementById('editTodoTitle')?.value?.trim();
      const content = document.getElementById('editTodoContent')?.value?.trim();
      const remindAt = getRemindValue('editRemindPicker');
      if (!title) { showToast('⚠️ 标题不能为空'); return; }
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

  hourSelect.innerHTML = Array.from({length: 24}, (_, i) => 
    `<option value="${i}">${String(i).padStart(2,'0')}</option>`
  ).join('');

  minuteSelect.innerHTML = Array.from({length: 12}, (_, i) => 
    `<option value="${i*5}">${String(i*5).padStart(2,'0')}</option>`
  ).join('');

  if (existingDate) {
    const d = new Date(existingDate);
    picker.dataset.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    hourSelect.value = d.getHours();
    minuteSelect.value = Math.round(d.getMinutes() / 5) * 5;
    updateRemindDisplay(pickerId);
  } else {
    const now = new Date();
    hourSelect.value = Math.min(now.getHours() + 1, 23);
    minuteSelect.value = 0;
    picker.dataset.date = '';
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
  picker.dataset.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  updateRemindDisplay(pickerId);
}

function clearRemind(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.dataset.date = '';
  const display = picker.querySelector('.remind-date-display');
  if (display) display.textContent = '未设置';
}

function updateRemindDisplay(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const display = picker.querySelector('.remind-date-display');
  const dateStr = picker.dataset.date;
  if (!dateStr) { display.textContent = '未设置'; return; }
  const hour = picker.querySelector('.remind-hour').value;
  const minute = picker.querySelector('.remind-minute').value;
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
