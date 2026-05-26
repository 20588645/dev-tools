// ========== Module: Notes (工作日志) ==========
let notesWeekOffset = 0; // 0 = 本周, -1 = 上周, 1 = 下周
let notesWeekData = {}; // date -> content
let notesWeekTitles = {}; // date -> title
let noteSaveTimers = {};

async function loadNotes() {
  await loadWeekNotes();
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=周日
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadWeekNotes() {
  const dates = getWeekDates(notesWeekOffset);
  notesWeekData = {};

  // 恢复周末开关状态
  const weekendCb = document.getElementById('notesShowWeekend');
  if (weekendCb) weekendCb.checked = localStorage.getItem('devtools-notes-show-weekend') === 'true';

  // 加载每天的数据
  await Promise.all(dates.map(async date => {
    try {
      const note = await API.get('/api/notes/' + date);
      notesWeekData[date] = note.content || '';
      notesWeekTitles[date] = note.title || '';
    } catch {
      notesWeekData[date] = '';
      notesWeekTitles[date] = '';
    }
  }));

  renderWeekGrid();
  updateWeekLabel();
}

function updateWeekLabel() {
  const dates = getWeekDates(notesWeekOffset);
  const label = document.getElementById('notesWeekLabel');
  if (!label) return;

  const start = dates[0].slice(5); // MM-DD
  const end = dates[6].slice(5);
  const prefix = notesWeekOffset === 0 ? '本周 · ' : notesWeekOffset === -1 ? '上周 · ' : '';
  label.textContent = `${prefix}${start} ~ ${end}`;
}

function renderWeekGrid() {
  const grid = document.getElementById('notesWeekGrid');
  if (!grid) return;

  const dates = getWeekDates(notesWeekOffset);
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const today = formatDate(new Date());
  const showWeekend = document.getElementById('notesShowWeekend')?.checked;

  grid.classList.toggle('show-weekend', !!showWeekend);

  grid.innerHTML = dates.map((date, i) => {
    const isToday = date === today;
    const isWeekend = i >= 5;
    const content = notesWeekData[date] || '';
    const title = notesWeekTitles[date] || '';
    const todayBadge = isToday ? '<span class="notes-day-today-badge">今天</span>' : '';
    const extraClass = [isToday ? 'is-today' : '', isWeekend ? 'day-weekend' : ''].filter(Boolean).join(' ');

    return `
      <div class="notes-day-card ${extraClass}">
        <div class="notes-day-label">
          <span class="notes-day-name">${dayNames[i]}</span>
          <span class="notes-day-date">${date.slice(5)}</span>
          ${todayBadge}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0">
          <input type="text" class="notes-day-title-input" data-date="${date}" value="${escapeAttr(title)}" placeholder="项目/标题..." oninput="onWeekNoteInput('${date}')">
          <textarea class="notes-day-textarea" data-date="${date}" placeholder="记录${dayNames[i]}的工作..." oninput="onWeekNoteInput('${date}')">${escapeHtml(content)}</textarea>
        </div>
      </div>
    `;
  }).join('');
}

function toggleWeekend(show) {
  localStorage.setItem('devtools-notes-show-weekend', show ? 'true' : 'false');
  renderWeekGrid();
}

function onWeekNoteInput(date) {
  const saveStatus = document.getElementById('notesSaveStatus');
  if (saveStatus) saveStatus.textContent = '';

  if (noteSaveTimers[date]) clearTimeout(noteSaveTimers[date]);
  noteSaveTimers[date] = setTimeout(() => {
    delete noteSaveTimers[date];
    saveWeekNote(date);
  }, 800);
}

async function saveWeekNote(date) {
  const textarea = document.querySelector(`.notes-day-textarea[data-date="${date}"]`);
  const titleInput = document.querySelector(`.notes-day-title-input[data-date="${date}"]`);
  if (!textarea) return;
  const content = textarea.value;
  const title = titleInput?.value || '';
  const saveStatus = document.getElementById('notesSaveStatus');

  try {
    await API.post('/api/notes', { date, content, title });
    notesWeekData[date] = content;
    notesWeekTitles[date] = title;
    if (saveStatus) saveStatus.textContent = '✓ 已保存';
  } catch (e) {
    if (saveStatus) saveStatus.textContent = '⚠️ 保存失败';
  }
}

function notesPrevWeek() {
  notesWeekOffset--;
  loadWeekNotes();
}

function notesNextWeek() {
  notesWeekOffset++;
  loadWeekNotes();
}

function toggleNotesReference() {
  const panel = document.getElementById('notesReference');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'flex';

  if (!isVisible) {
    loadNotesReference();
  }
}

async function loadNotesReference() {
  const content = document.getElementById('notesRefContent');
  if (!content) return;
  content.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">加载中...</div>';

  const resultArea = document.getElementById('rptResultArea');
  if (resultArea && resultArea.innerHTML.trim() && !resultArea.querySelector('.rpt-empty-state')) {
    // 精简周报：只保留分组标题 + 仓库名 + 提交内容列
    const sections = resultArea.querySelectorAll('.rpt-result-section, .rpt-group-header');
    if (sections.length > 0) {
      let html = '';
      sections.forEach(el => {
        if (el.classList.contains('rpt-group-header')) {
          // 分组标题
          const name = el.querySelector('.rpt-group-name');
          const count = el.querySelector('.rpt-group-count');
          html += `<div class="notes-ref-group-title">📁 ${name ? name.textContent : ''} <span>${count ? count.textContent : ''}</span></div>`;
        } else {
          // 仓库 section
          const h3 = el.querySelector('h3');
          const repoName = h3 ? h3.textContent.replace(/\d+\s*(仓|提交)/g, '').trim() : '';
          html += `<div class="notes-ref-repo">${repoName}</div>`;

          // 提取每行的提交内容（最后一列）
          const rows = el.querySelectorAll('tbody tr');
          if (rows.length > 0) {
            html += '<ul class="notes-ref-commits">';
            rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 4) {
                const dateStr = cells[0].textContent.trim().slice(5); // MM-DD
                // 获取提交内容，保留换行
                const commitCell = cells[3];
                const commitLines = commitCell.innerHTML
                  .split(/<br\s*\/?>/gi)
                  .map(s => s.replace(/<[^>]*>/g, '').trim())
                  .filter(Boolean);
                commitLines.forEach(line => {
                  html += `<li><span class="notes-ref-date">${dateStr}</span>${escapeHtml(line)}</li>`;
                });
              }
            });
            html += '</ul>';
          }
        }
      });
      content.innerHTML = html || '<div style="color:var(--text-muted);padding:20px;text-align:center">无提交记录</div>';
    } else {
      content.innerHTML = resultArea.innerHTML;
    }
    return;
  }

  content.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">暂无周报数据。<br><br>请先到「Git 周报」页面生成本周报告，<br>然后回来点击此按钮即可加载。</div>';
}
