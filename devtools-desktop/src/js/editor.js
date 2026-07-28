// ========== Module: File Editor (文件编辑器 · Notepad++ 风格) ==========

const edState = {
  cm: null,            // CodeMirror 实例
  tabs: new Map(),     // key(path 或 draft:N) -> { path|key, name, ext, eol, doc, cleanGen, mtime, isDraft, draftId }
  order: [],           // tab key 顺序
  active: null,        // 当前激活的 tab key
  untitledSeq: 0,      // 未命名草稿计数器
  inited: false,
};

const ED_TABS_KEY = 'devtools-editor-tabs';

function edEscapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 扩展名 -> CodeMirror mode
const ED_MODE_MAP = {
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', jsx: 'text/jsx',
  ts: 'text/typescript', tsx: 'text/typescript',
  json: 'application/json',
  html: 'htmlmixed', htm: 'htmlmixed',
  vue: 'text/x-vue',
  css: 'text/css', scss: 'text/x-scss', less: 'text/x-less',
  xml: 'application/xml', svg: 'application/xml', plist: 'application/xml',
  py: 'text/x-python',
  md: 'text/x-markdown', markdown: 'text/x-markdown',
  sh: 'text/x-sh', bash: 'text/x-sh', zsh: 'text/x-sh',
  yml: 'text/x-yaml', yaml: 'text/x-yaml',
  sql: 'text/x-sql',
  go: 'text/x-go',
  rs: 'text/x-rustsrc',
  php: 'application/x-httpd-php',
  c: 'text/x-csrc', h: 'text/x-csrc',
  cpp: 'text/x-c++src', cc: 'text/x-c++src', hpp: 'text/x-c++src',
  java: 'text/x-java',
};

// 语言展示名
const ED_LANG_LABEL = {
  'text/javascript': 'JavaScript', 'text/jsx': 'JSX', 'text/typescript': 'TypeScript',
  'application/json': 'JSON', 'htmlmixed': 'HTML', 'text/x-vue': 'Vue',
  'text/css': 'CSS', 'text/x-scss': 'SCSS', 'text/x-less': 'Less',
  'application/xml': 'XML', 'text/x-python': 'Python', 'text/x-markdown': 'Markdown',
  'text/x-sh': 'Shell', 'text/x-yaml': 'YAML', 'text/x-sql': 'SQL',
  'text/x-go': 'Go', 'text/x-rustsrc': 'Rust', 'application/x-httpd-php': 'PHP',
  'text/x-csrc': 'C', 'text/x-c++src': 'C++', 'text/x-java': 'Java',
};

function edModeForExt(ext) {
  return ED_MODE_MAP[(ext || '').toLowerCase()] || null;
}

function edThemeName() {
  return document.body.getAttribute('data-theme') === 'light' ? 'default' : 'material-darker';
}

async function initEditor() {
  if (!edState.inited) {
    edState.inited = true;
    edMountEditor();
    edBindKeys();
    edWatchTheme();
    await edRestoreSession();
    // 没有可恢复的文件时，默认打开一个空白草稿，方便随时记录
    if (edState.order.length === 0) edNewScratchTab();
  } else {
    // 重新进入页面时刷新一下尺寸（CodeMirror 在隐藏容器里挂载后需要 refresh）
    if (edState.cm) setTimeout(() => edState.cm.refresh(), 0);
  }
}

function edMountEditor() {
  const host = document.getElementById('edEditorHost');
  if (!host || edState.cm) return;
  edState.cm = CodeMirror(host, {
    value: '',
    mode: null,
    theme: edThemeName(),
    lineNumbers: true,
    lineWrapping: false,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    extraKeys: {
      // Cmd+S/T/W 统一在文档级处理（见 edBindKeys），避免与 CM 重复触发
      'Cmd-F': 'findPersistent',
      'Ctrl-F': 'findPersistent',
      'Cmd-Alt-F': 'replace',
      'Ctrl-Shift-F': 'replace',
      'Tab': (cm) => {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('  ', 'end');
      },
    },
  });

  edState.cm.on('change', () => edUpdateDirty());
  edState.cm.on('cursorActivity', () => edUpdateCursor());
}

function edBindKeys() {
  // 文档级快捷键：⌘S 保存 / ⌘T 新建标签 / ⌘W 关闭当前标签（仅在文件编辑页生效）
  document.addEventListener('keydown', (e) => {
    const page = document.getElementById('page-editor');
    if (!page || !page.classList.contains('active')) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 't' && e.shiftKey) {
      e.preventDefault();
      edReopenClosed();
    } else if (k === 's') {
      e.preventDefault();
      edSaveCurrent();
    } else if (k === 't') {
      e.preventDefault();
      edNewScratchTab();
    } else if (k === 'w') {
      e.preventDefault();
      if (edState.active) edCloseTab(edState.active);
    }
  });
}

// 新建一个空白草稿标签（未保存到 DB，draftId 为 null；⌘S 后存入 SQLite）
function edNewScratchTab(opts = {}) {
  if (!edState.cm) return;
  edState.untitledSeq += 1;
  const key = 'draft:' + edState.untitledSeq;
  const doc = CodeMirror.Doc(opts.content || '', null);
  const tab = {
    path: key,
    name: opts.name || ('未命名-' + edState.untitledSeq),
    ext: '',
    eol: 'LF',
    mtime: 0,
    doc,
    cleanGen: doc.changeGeneration(),
    isDraft: true,
    draftId: opts.draftId || null,
  };
  edState.tabs.set(key, tab);
  edState.order.push(key);
  edActivate(key);
  return key;
}

let edThemeObserver = null;
function edWatchTheme() {
  if (edThemeObserver) return;
  edThemeObserver = new MutationObserver(() => {
    if (edState.cm) edState.cm.setOption('theme', edThemeName());
  });
  edThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
}

// ===== 打开文件 / 另存为（应用内文件浏览器，与「添加项目」手动浏览同一套方案，无原生弹窗） =====
const edBrowseState = { currentDir: null, parent: null, home: null };
let edBrowserMode = 'open';   // 'open' | 'save'
let edSaveAsKey = null;       // save 模式下待保存的 tab key

function edOpenFileDialog() {
  edBrowserMode = 'open';
  edSaveAsKey = null;
  edApplyBrowserMode();
  document.getElementById('edBrowserModal')?.classList.add('active');
  edBrowseTo(edBrowseState.currentDir || undefined);
}

function edSaveAsDialog(key) {
  edBrowserMode = 'save';
  edSaveAsKey = key;
  edApplyBrowserMode();
  const tab = edState.tabs.get(key);
  const input = document.getElementById('edSaveFilename');
  if (input) input.value = tab ? (tab.name + '.txt') : '';
  document.getElementById('edBrowserModal')?.classList.add('active');
  edBrowseTo(edBrowseState.currentDir || undefined);
}

// 根据 open/save 模式切换弹窗标题与底部保存栏
function edApplyBrowserMode() {
  const isSave = edBrowserMode === 'save';
  const title = document.getElementById('edBrowserTitle');
  const subtitle = document.getElementById('edBrowserSubtitle');
  const saveRow = document.getElementById('edSaveRow');
  if (title) title.textContent = isSave ? '💾 另存为' : '📂 打开文件';
  if (subtitle) subtitle.textContent = isSave ? '选择保存目录，填写文件名后点保存' : '浏览目录，点击文件即可打开编辑';
  if (saveRow) saveRow.style.display = isSave ? 'flex' : 'none';
}

async function edBrowseTo(dir) {
  let data;
  try {
    const url = '/api/editor/browse' + (dir ? ('?dir=' + encodeURIComponent(dir)) : '');
    data = await API.get(url);
  } catch (e) {
    showToast('⚠️ ' + (e?.message || e));
    return;
  }
  edBrowseState.currentDir = data.currentDir;
  edBrowseState.parent = data.parent;
  edBrowseState.home = data.home;

  const upBtn = document.getElementById('edBrowseUpBtn');
  if (upBtn) upBtn.style.opacity = data.parent ? '1' : '0.4';

  edRenderBreadcrumb(data.currentDir);
  edRenderBrowseList(data.entries);
}

function edBrowseHome() { edBrowseTo(edBrowseState.home || undefined); }
function edBrowseUp() { if (edBrowseState.parent) edBrowseTo(edBrowseState.parent); }

function edRenderBreadcrumb(currentDir) {
  const el = document.getElementById('edBrowseBreadcrumb');
  if (!el) return;
  const parts = currentDir.split('/').filter(Boolean);
  let accum = '';
  let html = `<button onclick="edBrowseTo('/')">/</button>`;
  parts.forEach(p => {
    accum += '/' + p;
    html += `<span>/</span><button onclick="edBrowseTo('${accum.replace(/'/g, "\\'")}')">${edEscapeHTML(p)}</button>`;
  });
  el.innerHTML = html;
}

function edFormatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function edRenderBrowseList(entries) {
  const el = document.getElementById('edBrowseList');
  if (!el) return;
  if (!entries.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px">此目录为空</div>';
    return;
  }
  el.innerHTML = entries.map(e => {
    const safe = e.path.replace(/'/g, "\\'");
    if (e.isDir) {
      return `<div class="browser-item" onclick="edBrowseTo('${safe}')" style="cursor:pointer">
        <span style="display:flex;align-items:center;gap:8px">📁 ${edEscapeHTML(e.name)}</span>
        <span style="font-size:11px;color:var(--text-muted)">→</span>
      </div>`;
    }
    const action = edBrowserMode === 'save'
      ? `edPickSaveTarget('${safe}', '${edEscapeHTML(e.name).replace(/'/g, "\\'")}')`
      : `edPickFile('${safe}')`;
    return `<div class="browser-item" onclick="${action}" style="cursor:pointer">
      <span style="display:flex;align-items:center;gap:8px"><span style="color:var(--accent)">📄</span> ${edEscapeHTML(e.name)}</span>
      <span style="font-size:11px;color:var(--text-muted)">${edFormatSize(e.size || 0)}</span>
    </div>`;
  }).join('');
}

async function edPickFile(filePath) {
  closeModal('edBrowserModal');
  await edOpenPath(filePath);
}

// save 模式下点击已有文件 = 把文件名填入输入框（方便覆盖保存）
function edPickSaveTarget(filePath, name) {
  const input = document.getElementById('edSaveFilename');
  if (input) input.value = name;
}

// 确认另存为：把当前草稿写入「当前目录 / 文件名」，并把草稿 tab 转为文件 tab
async function edConfirmSaveAs() {
  const key = edSaveAsKey;
  const tab = key && edState.tabs.get(key);
  if (!tab) { closeModal('edBrowserModal'); return; }
  const input = document.getElementById('edSaveFilename');
  const filename = (input?.value || '').trim();
  if (!filename) { showToast('⚠️ 请填写文件名'); return; }
  if (filename.includes('/')) { showToast('⚠️ 文件名不能包含 /'); return; }
  const dir = edBrowseState.currentDir;
  if (!dir) { showToast('⚠️ 请选择保存目录'); return; }
  const targetPath = dir.replace(/\/$/, '') + '/' + filename;

  // 已打开同名文件则提示
  if (edState.tabs.has(targetPath)) { showToast('⚠️ 该文件已在标签中打开'); return; }

  const content = tab.doc.getValue();
  try {
    const r = await API.post('/api/editor/write', { path: targetPath, content, eol: tab.eol });
    // 若原本是草稿，导出成文件后删除其 DB 记录（已变成磁盘文件，不再是草稿）
    if (tab.isDraft && tab.draftId) {
      try { await API.del('/api/editor/drafts/' + tab.draftId); } catch (e) {}
    }
    // 把 tab 原地转为文件 tab：换 key、更新元信息、重定语言
    const ext = (filename.split('.').pop() || '').toLowerCase();
    tab.path = targetPath;
    tab.name = filename;
    tab.ext = ext;
    tab.mtime = r.mtime;
    tab.isDraft = false;
    tab.draftId = null;
    tab.cleanGen = tab.doc.changeGeneration();
    edState.tabs.delete(key);
    edState.tabs.set(targetPath, tab);
    edState.order = edState.order.map(k => (k === key ? targetPath : k));
    if (edState.active === key) edState.active = targetPath;
    edState.cm.setOption('mode', edModeForExt(ext));
    closeModal('edBrowserModal');
    edRenderTabs();
    edUpdateStatusbar();
    edSetSaveStatus('<span class="save-dot success"></span>已保存');
    edPersistSession();
    showToast('✅ 已保存到 ' + targetPath);
  } catch (e) {
    showToast('⚠️ 保存失败: ' + (e?.message || e));
  }
}

async function edOpenPath(filePath, { silent = false } = {}) {
  if (!filePath) return false;
  // 已打开则直接切换
  if (edState.tabs.has(filePath)) {
    edActivate(filePath);
    return true;
  }
  let file;
  try {
    file = await API.post('/api/editor/read', { path: filePath });
  } catch (e) {
    if (!silent) showToast('⚠️ ' + e.message);
    return false;
  }
  const mode = edModeForExt(file.ext);
  const doc = CodeMirror.Doc(file.content, mode);
  const tab = {
    path: file.path,
    name: file.name,
    ext: file.ext,
    eol: file.eol || 'LF',
    mtime: file.mtime,
    doc,
    cleanGen: doc.changeGeneration(),
  };
  edState.tabs.set(file.path, tab);
  edState.order.push(file.path);
  edActivate(file.path);
  edPersistSession();
  return true;
}

function edActivate(path) {
  const tab = edState.tabs.get(path);
  if (!tab || !edState.cm) return;
  edState.active = path;
  edState.cm.swapDoc(tab.doc);
  edState.cm.setOption('mode', edModeForExt(tab.ext));
  document.getElementById('edEmpty').style.display = 'none';
  document.getElementById('edEditorHost').style.display = '';
  document.getElementById('edStatusbar').style.display = '';
  setTimeout(() => { edState.cm.refresh(); edState.cm.focus(); }, 0);
  edRenderTabs();
  edUpdateStatusbar();
  edPersistSession();
}

function edRenderTabs() {
  const bar = document.getElementById('edTabs');
  if (!bar) return;
  if (edState.order.length === 0) {
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = edState.order.map(path => {
    const tab = edState.tabs.get(path);
    if (!tab) return '';
    const isActive = path === edState.active;
    const dirty = !tab.doc.isClean(tab.cleanGen);
    const safe = path.replace(/'/g, "\\'");
    return `
      <div class="ed-tab ${isActive ? 'active' : ''}" data-path="${edEscapeHTML(path)}" onclick="edActivate('${safe}')" oncontextmenu="edShowTabMenu(event,'${safe}')" title="${edEscapeHTML(path)}">
        <span class="ed-tab-name">${edEscapeHTML(tab.name)}</span>
        <span class="ed-tab-close ${dirty ? 'dirty' : ''}" onclick="event.stopPropagation();edCloseTab('${safe}')" title="${dirty ? '未保存' : '关闭'}">
          <svg class="ed-tab-x" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      </div>`;
  }).join('');
}

// 标签是否「有未保存内容」（关闭前需要确认）
function edTabNeedsConfirm(tab) {
  const dirty = !tab.doc.isClean(tab.cleanGen);
  if (!dirty) return false;
  if (tab.isDraft) return !!tab.doc.getValue().trim();
  return true;
}

async function edCloseTab(path) {
  const tab = edState.tabs.get(path);
  if (!tab) return;
  if (edTabNeedsConfirm(tab)) {
    const msg = tab.isDraft
      ? `草稿「${tab.name}」有未保存的修改，关闭将丢弃，确定？`
      : `「${tab.name}」有未保存的修改，确定关闭？`;
    const ok = await showConfirm(msg, { icon: '⚠️', confirmText: tab.isDraft ? '丢弃关闭' : '不保存关闭', danger: true });
    if (!ok) return;
  }
  edForceCloseTab(path);
}

// 不弹确认，直接关闭单个标签（删草稿 DB 记录、入最近关闭栈、处理激活）
function edForceCloseTab(path) {
  const tab = edState.tabs.get(path);
  if (!tab) return;
  const content = tab.doc.getValue();
  if (tab.isDraft) {
    if (tab.draftId) { API.del('/api/editor/drafts/' + tab.draftId).catch(() => {}); }
    edPushClosed({ kind: 'draft', name: tab.name, content });
  } else {
    edPushClosed({ kind: 'file', path: tab.path });
  }

  edState.tabs.delete(path);
  edState.order = edState.order.filter(p => p !== path);

  if (edState.active === path) {
    const next = edState.order[edState.order.length - 1] || null;
    if (next) {
      edActivate(next);
    } else {
      // 关掉最后一个标签后，自动开一个新草稿，保证编辑器始终可用
      edState.active = null;
      edNewScratchTab();
    }
  } else {
    edRenderTabs();
  }
  edPersistSession();
}

// 批量关闭（关闭其他 / 关闭右侧）：若有未保存内容只确认一次
async function edBatchClose(targets, keepKey) {
  if (!targets.length) return;
  const anyDirty = targets.some(k => { const t = edState.tabs.get(k); return t && edTabNeedsConfirm(t); });
  if (anyDirty) {
    const ok = await showConfirm('有未保存的标签，确定全部关闭？（草稿会被丢弃）', { icon: '⚠️', confirmText: '全部关闭', danger: true });
    if (!ok) return;
  }
  for (const k of targets) edForceCloseTab(k);
  if (keepKey && edState.tabs.has(keepKey)) edActivate(keepKey);
}
function edCloseOthers(key) { edBatchClose(edState.order.filter(k => k !== key), key); }
function edCloseToRight(key) {
  const idx = edState.order.indexOf(key);
  edBatchClose(edState.order.slice(idx + 1), key);
}

// ===== 最近关闭的标签栈（⌘⇧T 恢复）=====
const edClosedStack = [];
function edPushClosed(item) {
  edClosedStack.push(item);
  if (edClosedStack.length > 20) edClosedStack.shift();
}
async function edReopenClosed() {
  const item = edClosedStack.pop();
  if (!item) { showToast('没有可恢复的标签'); return; }
  if (item.kind === 'file') {
    await edOpenPath(item.path);
  } else {
    edNewScratchTab({ name: item.name, content: item.content });
  }
}

// ===== 标签右键菜单 =====
let edTabMenuKey = null;

function edCloseTabMenu() {
  const m = document.getElementById('edTabMenu');
  if (m) m.remove();
  edTabMenuKey = null;
}

function edShowTabMenu(ev, key) {
  ev.preventDefault();
  ev.stopPropagation();
  edCloseTabMenu();
  const tab = edState.tabs.get(key);
  if (!tab) return;
  edTabMenuKey = key;

  const idx = edState.order.indexOf(key);
  const hasOthers = edState.order.length > 1;
  const hasRight = idx > -1 && idx < edState.order.length - 1;

  const item = (label, fn, enabled = true) =>
    `<div class="ed-tab-menu-item${enabled ? '' : ' disabled'}"${enabled ? ` onclick="${fn}"` : ''}>${label}</div>`;

  const rows = [];
  if (tab.isDraft) rows.push(item('✏️ 重命名草稿', 'edRenameDraft()'));
  else rows.push(item('📋 复制文件路径', 'edCopyTabPath()'));
  rows.push('<div class="ed-tab-menu-sep"></div>');
  rows.push(item('✕ 关闭', 'edMenuCloseSelf()'));
  rows.push(item('关闭其他', 'edMenuCloseOthers()', hasOthers));
  rows.push(item('关闭右侧', 'edMenuCloseRight()', hasRight));

  const menu = document.createElement('div');
  menu.className = 'ed-tab-menu';
  menu.id = 'edTabMenu';
  menu.innerHTML = rows.join('');
  document.body.appendChild(menu);

  // 定位，避免超出视口
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = ev.clientX, y = ev.clientY;
  if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
  if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // 点击别处 / 按 Esc 关闭
  setTimeout(() => {
    document.addEventListener('click', edCloseTabMenu, { once: true });
    document.addEventListener('keydown', edTabMenuEsc, { once: true });
  }, 0);
}

function edTabMenuEsc(e) { if (e.key === 'Escape') edCloseTabMenu(); }

function edMenuCloseSelf() { const k = edTabMenuKey; edCloseTabMenu(); if (k) edCloseTab(k); }
function edMenuCloseOthers() { const k = edTabMenuKey; edCloseTabMenu(); if (k) edCloseOthers(k); }
function edMenuCloseRight() { const k = edTabMenuKey; edCloseTabMenu(); if (k) edCloseToRight(k); }

async function edRenameDraft() {
  const key = edTabMenuKey;
  edCloseTabMenu();
  const tab = key && edState.tabs.get(key);
  if (!tab || !tab.isDraft) return;
  const name = await showPrompt('重命名草稿', { icon: '✏️', defaultValue: tab.name, placeholder: '草稿名称' });
  if (name === null) return; // 取消
  const newName = name.trim() || tab.name;
  tab.name = newName;
  if (tab.draftId) { try { await API.put('/api/editor/drafts/' + tab.draftId, { title: newName }); } catch (e) {} }
  edRenderTabs();
  edUpdateStatusbar();
}

async function edCopyTabPath() {
  const key = edTabMenuKey;
  edCloseTabMenu();
  const tab = key && edState.tabs.get(key);
  if (!tab || tab.isDraft) return;
  try {
    await navigator.clipboard.writeText(tab.path);
    showToast('✅ 已复制路径');
  } catch (e) {
    showToast('⚠️ 复制失败');
  }
}

async function edSaveCurrent() {
  const key = edState.active;
  if (!key) return;
  const tab = edState.tabs.get(key);
  if (!tab) return;

  if (tab.doc.isClean(tab.cleanGen)) {
    edSetSaveStatus('<span class="save-dot success"></span>已是最新');
    return;
  }
  const content = tab.doc.getValue();
  edSetSaveStatus('<span class="save-dot warning loading"></span>保存中');

  // 草稿：存入 SQLite（像笔记本一样），不写文件
  if (tab.isDraft) {
    try {
      if (tab.draftId) {
        await API.put('/api/editor/drafts/' + tab.draftId, { title: tab.name, content });
      } else {
        const d = await API.post('/api/editor/drafts', { title: tab.name, content });
        tab.draftId = d.id;
      }
      tab.cleanGen = tab.doc.changeGeneration();
      edSetSaveStatus('<span class="save-dot success"></span>已保存');
      edRenderTabs();
      edUpdateStatusbar();
    } catch (e) {
      edSetSaveStatus('<span class="save-dot danger"></span>保存失败');
      showToast('⚠️ 保存失败: ' + (e?.message || e));
    }
    return;
  }

  // 文件：写回磁盘
  try {
    const r = await API.post('/api/editor/write', { path: tab.path, content, eol: tab.eol });
    tab.cleanGen = tab.doc.changeGeneration();
    tab.mtime = r.mtime;
    edSetSaveStatus('<span class="save-dot success"></span>已保存');
    edRenderTabs();
  } catch (e) {
    edSetSaveStatus('<span class="save-dot danger"></span>保存失败');
    showToast('⚠️ 保存失败: ' + e.message);
  }
}

// 另存为：把当前激活标签导出为磁盘文件（单独的功能按钮触发）
function edSaveAsActive() {
  if (!edState.active) { showToast('⚠️ 没有可另存的标签'); return; }
  edSaveAsDialog(edState.active);
}

function edUpdateDirty() {
  // 内容变化时只更新当前 tab 的脏标记与状态
  const tab = edState.tabs.get(edState.active);
  if (!tab) return;
  const dirty = !tab.doc.isClean(tab.cleanGen);
  edSetSaveStatus(dirty ? '<span class="save-dot warning"></span>未保存' : '<span class="save-dot success"></span>已保存');
  // 只更新对应 tab 的关闭按钮脏点，避免整条重渲染丢焦点
  const tabEl = document.querySelector(`.ed-tab[data-path="${CSS.escape(edState.active)}"] .ed-tab-close`);
  if (tabEl) tabEl.classList.toggle('dirty', dirty);
}

function edUpdateCursor() {
  if (!edState.cm) return;
  const c = edState.cm.getCursor();
  const el = document.getElementById('edStatusCursor');
  if (el) el.textContent = `行 ${c.line + 1}, 列 ${c.ch + 1}`;
}

function edUpdateStatusbar() {
  const tab = edState.tabs.get(edState.active);
  if (!tab) return;
  const pathEl = document.getElementById('edStatusPath');
  const langEl = document.getElementById('edStatusLang');
  const eolEl = document.getElementById('edStatusEol');
  if (pathEl) pathEl.textContent = tab.isDraft ? (tab.name + (tab.draftId ? '（草稿·已存）' : '（草稿·未存）')) : tab.path;
  const mode = edModeForExt(tab.ext);
  if (langEl) langEl.textContent = ED_LANG_LABEL[mode] || '纯文本';
  if (eolEl) eolEl.textContent = tab.eol;
  edUpdateCursor();
  edUpdateDirty();
}

function edSetSaveStatus(html) {
  const el = document.getElementById('edStatusSave');
  if (el) el.innerHTML = html;
}

// ===== 会话持久化（记住上次打开的文件）=====
function edPersistSession() {
  try {
    // 只持久化真实文件路径；草稿（draft:N）走 DB 持久化，不存 localStorage
    const order = edState.order.filter(k => !k.startsWith('draft:'));
    const active = (edState.active && !edState.active.startsWith('draft:')) ? edState.active : null;
    localStorage.setItem(ED_TABS_KEY, JSON.stringify({ order, active }));
  } catch (e) {}
}

async function edRestoreSession() {
  // 1. 先恢复已保存到 DB 的草稿
  try {
    const drafts = await API.get('/api/editor/drafts');
    for (const d of drafts) {
      const key = edNewScratchTab({ name: d.title || '未命名', content: d.content || '' });
      const tab = edState.tabs.get(key);
      if (tab) { tab.draftId = d.id; tab.cleanGen = tab.doc.changeGeneration(); }
    }
  } catch (e) { /* DB 草稿恢复失败不阻塞 */ }

  // 2. 再恢复上次打开的磁盘文件
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ED_TABS_KEY) || 'null'); } catch (e) { saved = null; }
  if (saved && Array.isArray(saved.order)) {
    for (const p of saved.order) {
      await edOpenPath(p, { silent: true });
    }
    if (saved.active && edState.tabs.has(saved.active)) edActivate(saved.active);
  }
  edRenderTabs();
  edUpdateStatusbar();
}
