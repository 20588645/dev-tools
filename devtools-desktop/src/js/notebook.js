// ========== Module: Notebook (笔记本) ==========
let nbNotes = [];
let nbCurrentId = null;
let nbCurrentTag = null;
let nbSaveTimer = null;
let nbInitialized = false;

async function initNotebook() {
  if (!nbInitialized) {
    nbInitialized = true;
  }
  await nbLoadNotes();
  await nbLoadTags();
}

async function nbLoadNotes() {
  try {
    const search = document.getElementById('nbSearch')?.value || '';
    let url = '/api/notebook';
    const params = [];
    if (search) params.push('search=' + encodeURIComponent(search));
    if (nbCurrentTag) params.push('tag=' + encodeURIComponent(nbCurrentTag));
    if (params.length) url += '?' + params.join('&');
    nbNotes = await API.get(url);
  } catch (e) {
    nbNotes = [];
  }
  nbRenderNoteList();
}

async function nbLoadTags() {
  try {
    const tags = await API.get('/api/notebook/tags/list');
    const list = document.getElementById('nbTagsList');
    const allCount = document.getElementById('nbAllCount');
    if (allCount) allCount.textContent = nbNotes.length;
    if (list) {
      list.innerHTML = tags.map(t => `
        <div class="nb-tag-item ${nbCurrentTag === t.name ? 'active' : ''}" onclick="nbFilterTag('${t.name.replace(/'/g, "\\'")}')">
          <span>#${t.name}</span>
          <span class="nb-tag-count">${t.count}</span>
        </div>
      `).join('');
    }
  } catch (e) { console.warn("[Notebook] 加载笔记失败:", e.message); }
}

function nbRenderNoteList() {
  const list = document.getElementById('nbNoteList');
  if (!list) return;
  if (nbNotes.length === 0) {
    list.innerHTML = '<div class="nb-empty">暂无笔记</div>';
    return;
  }
  list.innerHTML = nbNotes.map((n, idx) => {
    const isActive = n.id === nbCurrentId;
    const pinIcon = n.pinned ? '<svg class="nb-item-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 8h6M12 8V2M5 8h14c0 4.5-3 6-7 9-4-3-7-4.5-7-9z"/></svg>' : '';
    const time = new Date(n.createdAt).toLocaleDateString('zh-CN');
    const upBtn = idx > 0 ? `<button class="nb-sort-btn" onclick="event.stopPropagation();nbMoveNote('${n.id}',-1)" title="上移"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg></button>` : '';
    const downBtn = idx < nbNotes.length - 1 ? `<button class="nb-sort-btn" onclick="event.stopPropagation();nbMoveNote('${n.id}',1)" title="下移"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg></button>` : '';

    return `
      <div class="nb-note-item ${isActive ? 'active' : ''} ${n.pinned ? 'pinned' : ''}" data-id="${n.id}" onclick="nbSelectNote('${n.id}')">
        <div class="nb-note-item-body">
          <div class="nb-note-item-title">${pinIcon}<span class="nb-note-title-text">${n.title || '无标题'}</span></div>
          <div class="nb-note-item-preview">${n.preview || ''}</div>
          <div class="nb-note-item-time">${time}</div>
        </div>
        <div class="nb-sort-btns">${upBtn}${downBtn}</div>
      </div>
    `;
  }).join('');
}

async function nbMoveNote(id, direction) {
  const idx = nbNotes.findIndex(n => n.id === id);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= nbNotes.length) return;

  // 交换位置
  [nbNotes[idx], nbNotes[newIdx]] = [nbNotes[newIdx], nbNotes[idx]];

  // 保存新顺序
  const ids = nbNotes.map(n => n.id);
  try {
    await API.put('/api/notebook/reorder', { ids });
  } catch (e) { console.warn("[Notebook] 排序保存失败"); }

  // 重新渲染列表
  nbRenderNoteList();
}

async function nbSelectNote(id) {
  // Save current first
  if (nbSaveTimer) { clearTimeout(nbSaveTimer); nbSaveTimer = null; await nbSaveCurrentNote(); }
  
  nbCurrentId = id;
  try {
    const note = await API.get('/api/notebook/' + id);
    document.getElementById('nbTitleInput').value = note.title || '';
    document.getElementById('nbEditorContent').innerHTML = note.content || '';
    
    const pinBtn = document.getElementById('nbPinBtn');
    if (pinBtn) {
      if (note.pinned) {
        pinBtn.classList.add('active');
        pinBtn.setAttribute('title', '取消置顶');
      } else {
        pinBtn.classList.remove('active');
        pinBtn.setAttribute('title', '置顶');
      }
    }
    document.getElementById('nbSaveStatus').innerHTML = '';
    nbRenderNoteList();
  } catch (e) {
    showToast('⚠️ 加载笔记失败');
  }
}

async function nbCreateNote() {
  try {
    const note = await API.post('/api/notebook', { title: '', content: '' });
    nbCurrentId = note.id;
    await nbLoadNotes();
    await nbLoadTags();
    document.getElementById('nbTitleInput').value = '';
    document.getElementById('nbEditorContent').innerHTML = '';
    document.getElementById('nbTitleInput').focus();
  } catch (e) {
    showToast('⚠️ 创建失败');
  }
}

function nbOnTitleInput() {
  if (nbSaveTimer) clearTimeout(nbSaveTimer);
  nbSaveTimer = setTimeout(() => { nbSaveTimer = null; nbSaveCurrentNote(); }, 800);
  document.getElementById('nbSaveStatus').innerHTML = '<span class="save-dot warning loading"></span>正在编辑';
}

function nbOnContentChange() {
  if (!nbCurrentId) return;
  if (nbSaveTimer) clearTimeout(nbSaveTimer);
  nbSaveTimer = setTimeout(() => { nbSaveTimer = null; nbSaveCurrentNote(); }, 800);
  document.getElementById('nbSaveStatus').innerHTML = '<span class="save-dot warning loading"></span>正在编辑';
}

async function nbSaveCurrentNote() {
  if (!nbCurrentId) return;
  const title = document.getElementById('nbTitleInput')?.value || '';
  const content = document.getElementById('nbEditorContent')?.innerHTML || '';
  try {
    await API.put('/api/notebook/' + nbCurrentId, { title, content });
    document.getElementById('nbSaveStatus').innerHTML = '<span class="save-dot success"></span>已保存';
    // 只更新本地列表中当前笔记的标题和预览，不重新加载和渲染
    const note = nbNotes.find(n => n.id === nbCurrentId);
    if (note) {
      note.title = title;
      note.preview = (content || '').replace(/[#*`>\-\[\]]/g, '').slice(0, 80);
      // 更新列表中对应项的显示
      const item = document.querySelector(`.nb-note-item[data-id="${nbCurrentId}"]`);
      if (item) {
        const titleTextEl = item.querySelector('.nb-note-title-text');
        const previewEl = item.querySelector('.nb-note-item-preview');
        if (titleTextEl) titleTextEl.textContent = title || '无标题';
        if (previewEl) previewEl.textContent = note.preview || '';
      }
    }
  } catch (e) {
    document.getElementById('nbSaveStatus').innerHTML = '<span class="save-dot danger"></span>保存失败';
  }
}

async function nbTogglePin() {
  if (!nbCurrentId) return;
  const note = nbNotes.find(n => n.id === nbCurrentId);
  if (!note) return;
  const newPinned = !note.pinned;
  try {
    await API.put('/api/notebook/' + nbCurrentId, { pinned: newPinned });
    const pinBtn = document.getElementById('nbPinBtn');
    if (pinBtn) {
      if (newPinned) {
        pinBtn.classList.add('active');
        pinBtn.setAttribute('title', '取消置顶');
      } else {
        pinBtn.classList.remove('active');
        pinBtn.setAttribute('title', '置顶');
      }
    }
    await nbLoadNotes();
  } catch (e) { console.warn("[Notebook] 置顶操作失败"); }
}

async function nbDeleteNote() {
  if (!nbCurrentId) return;
  const confirmed = await showConfirm('确定删除这篇笔记？', { icon: '🗑', confirmText: '删除', danger: true });
  if (!confirmed) return;
  try {
    await API.del('/api/notebook/' + nbCurrentId);
    nbCurrentId = null;
    document.getElementById('nbTitleInput').value = '';
    document.getElementById('nbEditorContent').innerHTML = '';
    await nbLoadNotes();
    await nbLoadTags();
    if (nbNotes.length > 0) nbSelectNote(nbNotes[0].id);
  } catch (e) {
    showToast('⚠️ 删除失败');
  }
}

function nbFilterTag(tag) {
  nbCurrentTag = tag;
  // Update active state
  document.querySelectorAll('.nb-tag-item').forEach(el => el.classList.remove('active'));
  if (!tag) {
    document.querySelector('.nb-tag-all')?.classList.add('active');
  }
  nbLoadNotes().then(() => nbLoadTags());
}

function nbSearchNotes() {
  if (nbSaveTimer) { clearTimeout(nbSaveTimer); nbSaveTimer = null; }
  nbLoadNotes();
}

// ========== 笔记本 - 粘贴图片处理 ==========
document.addEventListener('paste', async (e) => {
  const editor = document.getElementById('nbEditorContent');
  if (!editor || !editor.contains(document.activeElement) && document.activeElement !== editor) return;
  if (!nbCurrentId) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        try {
          const result = await API.post('/api/notebook/upload', { data: base64, filename: blob.name || 'image.png' });
          const img = document.createElement('img');
          img.src = API_BASE + result.url;
          img.alt = 'image';

          // 在光标位置插入图片
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.setStartAfter(img);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            editor.appendChild(img);
          }

          // 触发保存
          nbOnContentChange();
        } catch (err) {
          showToast('⚠️ 图片上传失败');
        }
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});

// ========== 笔记本 - Tab 键支持 ==========
document.addEventListener('keydown', (e) => {
  const editor = document.getElementById('nbEditorContent');
  if (!editor) return;
  if (document.activeElement !== editor && !editor.contains(document.activeElement)) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    // 在光标位置插入 Tab 字符
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const tabNode = document.createTextNode('\t');
      range.insertNode(tabNode);
      range.setStartAfter(tabNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      nbOnContentChange();
    }
  }
});

// ========== 笔记本 - 一键对齐（Cmd+Shift+L） ==========
document.addEventListener('keydown', (e) => {
  const editor = document.getElementById('nbEditorContent');
  if (!editor) return;
  if (document.activeElement !== editor && !editor.contains(document.activeElement)) return;

  // Cmd+Shift+L 一键对齐选中文本
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
    e.preventDefault();
    nbAlignSelection();
  }
});

function nbAlignSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const selectedText = selection.toString();
  if (!selectedText.trim()) return;

  // 将选中文本按行拆分，每行按 2+ 空格或 Tab 分割为字段
  const lines = selectedText.split('\n');
  const rows = lines.map(line => line.split(/\t| {2,}/).map(s => s.trim()).filter(Boolean));

  // 如果没有多列数据，尝试按单空格分割
  const hasMultiCols = rows.some(r => r.length > 1);
  if (!hasMultiCols) {
    rows.splice(0, rows.length, ...lines.map(line => line.split(/\s+/).filter(Boolean)));
  }

  // 跳过空行
  const dataRows = rows.filter(r => r.length > 0);
  if (dataRows.length === 0) return;

  // 用 Tab 连接每行字段
  const aligned = rows.map(r => r.length > 0 ? r.join('\t') : '').join('\n');

  // 替换选中内容
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(aligned);
  range.insertNode(textNode);

  // 选中替换后的内容
  range.selectNode(textNode);
  selection.removeAllRanges();
  selection.addRange(range);

  nbOnContentChange();
  showToast('✅ 已对齐');
}
