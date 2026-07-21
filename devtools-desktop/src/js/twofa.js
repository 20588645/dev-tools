/**
 * 2FA 账号列表 / TOTP 取码
 * 目标：把多个账号做成可扫视、可分组、可一键复制的正式页面。
 */

const twofaState = {
  inited: false,
  loading: false,
  loadSeq: 0,
  refreshTimer: null,
  countdownTimer: null,
  query: '',
  selectedGroup: 'all',
  selectedId: '',
  accounts: [],
  accountsById: new Map(),
  filtered: [],
  stats: { total: 0, favorites: 0, groups: {} },
  lastSyncAt: 0,
  lastError: '',
  bound: false,
  loadPromise: null,
};

function twofaEl(id) {
  return document.getElementById(id);
}

function twofaEscape(value) {
  const s = String(value ?? '');
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function twofaSelectorValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function twofaNormalizeText(value) {
  return String(value ?? '').trim();
}

function twofaIsActive() {
  return document.getElementById('page-twofa')?.classList.contains('active');
}

function twofaFormatClock(ts) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function twofaFormatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function twofaFormatRelativeSeconds(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s <= 0) return '即将刷新';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

function twofaAvatarText(account) {
  const base = twofaNormalizeText(account?.issuer || account?.accountName || '?');
  return base.slice(0, 1).toUpperCase();
}

function twofaCodeText(code) {
  const s = twofaNormalizeText(code);
  return s || '------';
}

function twofaGetFilteredAccounts() {
  const q = twofaNormalizeText(twofaState.query).toLowerCase();
  const group = twofaState.selectedGroup;
  return twofaState.accounts.filter(account => {
    const matchesGroup = group === 'all' || account.groupName === group;
    const haystack = `${account.issuer} ${account.accountName} ${account.tag || ''} ${account.groupName}`.toLowerCase();
    const matchesQuery = !q || haystack.includes(q);
    return matchesGroup && matchesQuery;
  });
}

function twofaSortAccounts(list) {
  return [...list].sort((a, b) => {
    if ((b.favorite ? 1 : 0) !== (a.favorite ? 1 : 0)) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
    if ((b.lastUsedAt || 0) !== (a.lastUsedAt || 0)) return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    if ((b.updatedAt || 0) !== (a.updatedAt || 0)) return (b.updatedAt || 0) - (a.updatedAt || 0);
    return `${a.issuer} ${a.accountName}`.localeCompare(`${b.issuer} ${b.accountName}`, 'zh-Hans-CN');
  });
}

function twofaRenderGroupChips() {
  const host = twofaEl('twofaGroupChips');
  if (!host) return;
  const groups = Object.entries(twofaState.stats.groups || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'));
  const chips = [
    `<button class="chip${twofaState.selectedGroup === 'all' ? ' active' : ''}" data-twofa-group="all">全部 ${twofaState.stats.total}</button>`,
    ...groups.map(([name, count]) => `<button class="chip${twofaState.selectedGroup === name ? ' active' : ''}" data-twofa-group="${twofaEscape(name)}">${twofaEscape(name)} ${count}</button>`),
  ];
  host.innerHTML = chips.join('');
}

function twofaRenderRecentStrip(accounts) {
  const host = twofaEl('twofaRecentStrip');
  const meta = twofaEl('twofaRecentMeta');
  if (!host || !meta) return;
  const recent = [...accounts]
    .filter(item => item.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
    .slice(0, 6);
  meta.textContent = recent.length ? `最近使用 ${recent.length} 项` : '最近使用记录会在复制验证码后更新';
  if (!recent.length) {
    host.innerHTML = `<div class="twofa-empty" style="min-height:120px">还没有最近使用记录，点一次“复制”就会出现在这里</div>`;
    return;
  }
  host.innerHTML = recent.map(account => {
    const active = account.id === twofaState.selectedId ? ' is-active' : '';
    const remaining = twofaFormatRelativeSeconds(account.remainingSeconds);
    return `
      <button type="button" class="twofa-recent-item${active}" data-twofa-select="${twofaEscape(account.id)}">
        <div class="twofa-recent-top">
          <div class="twofa-recent-main">
            <div class="twofa-avatar">${twofaEscape(twofaAvatarText(account))}</div>
            <div class="twofa-recent-name">
              <strong title="${twofaEscape(account.issuer)}">${twofaEscape(account.issuer)}</strong>
              <span title="${twofaEscape(account.accountName)}">${twofaEscape(account.accountName)}</span>
            </div>
          </div>
          <span class="twofa-badge${account.favorite ? ' favorite' : ''}">${account.favorite ? '★ 收藏' : account.groupName || '其他'}</span>
        </div>
        <div class="twofa-recent-code">${twofaEscape(twofaCodeText(account.currentCode))}</div>
        <div class="twofa-recent-meta">
          <span class="twofa-remaining"><span class="twofa-remaining-dot"></span><span data-twofa-countdown-for="${twofaEscape(account.id)}">${twofaEscape(remaining)}</span></span>
          <span>${twofaEscape(account.tag || account.groupName || '2FA')}</span>
        </div>
      </button>`;
  }).join('');
}

function twofaRenderRows(accounts) {
  const groups = new Map();
  for (const account of accounts) {
    const key = account.groupName || '其他';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(account);
  }

  const blocks = [...groups.entries()].map(([groupName, items]) => {
    const sorted = twofaSortAccounts(items);
    return `
      <section class="twofa-group-block">
        <div class="twofa-group-head">
          <div class="twofa-group-title">
            <span>${twofaEscape(groupName)}</span>
            <span class="chip">${sorted.length}</span>
          </div>
          <div class="twofa-group-count">${sorted.length} 个账号</div>
        </div>
        <div class="twofa-group-list">
          ${sorted.map(account => twofaRenderRow(account)).join('')}
        </div>
      </section>`;
  });

  const blocksHost = twofaEl('twofaGroupBlocks');
  const emptyHost = twofaEl('twofaEmptyState');
  const countHost = twofaEl('twofaAccountCount');
  const listMetaHost = twofaEl('twofaListMeta');

  if (countHost) countHost.textContent = twofaState.stats.total ? `共 ${twofaState.stats.total} 个` : '';
  if (listMetaHost) listMetaHost.textContent = `筛选后 ${accounts.length} 个账号`;
  if (blocksHost) blocksHost.innerHTML = blocks.join('');
  if (emptyHost) emptyHost.style.display = accounts.length ? 'none' : 'flex';
}

function twofaRenderRow(account) {
  const active = account.id === twofaState.selectedId ? ' is-active' : '';
  const code = twofaCodeText(account.currentCode);
  const remaining = twofaFormatRelativeSeconds(account.remainingSeconds);
  const progress = account.period ? Math.max(0, Math.min(100, ((account.period - Math.max(0, account.remainingSeconds || 0)) / account.period) * 100)) : 0;
  const tagBadge = account.tag ? `<span class="twofa-badge">${twofaEscape(account.tag)}</span>` : '';
  const favoriteBadge = account.favorite ? `<span class="twofa-badge favorite">★ 收藏</span>` : '';
  return `
    <div class="twofa-row${active}" data-twofa-id="${twofaEscape(account.id)}" data-twofa-period="${Number(account.period) || 30}" data-twofa-expires-at="${Number(account.expiresAt) || 0}">
      <div class="twofa-row-main">
        <div class="twofa-avatar">${twofaEscape(twofaAvatarText(account))}</div>
        <div class="twofa-row-body">
          <div class="twofa-row-title">${twofaEscape(account.issuer)}</div>
          <div class="twofa-row-subtitle">
            <span title="${twofaEscape(account.accountName)}">${twofaEscape(account.accountName)}</span>
            ${tagBadge}
            ${favoriteBadge}
          </div>
        </div>
      </div>
      <div class="twofa-code-block">
        <div class="twofa-code-value${account.currentCode ? '' : ' is-empty'}">${twofaEscape(code)}</div>
        <div class="twofa-code-hint">点击整行可在右侧查看</div>
      </div>
      <div class="twofa-row-status">
        <div class="twofa-countdown" data-twofa-countdown-for="${twofaEscape(account.id)}">${twofaEscape(remaining)}<small> · ${account.period || 30}s</small></div>
        <div class="twofa-progress"><span style="--pct:${progress}%"></span></div>
      </div>
      <div class="twofa-actions">
        <button type="button" class="btn btn--sm" data-twofa-action="copy" data-twofa-id="${twofaEscape(account.id)}">复制</button>
        <button type="button" class="btn btn--sm" data-twofa-action="edit" data-twofa-id="${twofaEscape(account.id)}">编辑</button>
        <button type="button" class="btn btn--sm btn--fav${account.favorite ? ' is-active' : ''}" data-twofa-action="favorite" data-twofa-id="${twofaEscape(account.id)}">★</button>
        <button type="button" class="btn btn--sm btn--danger" data-twofa-action="delete" data-twofa-id="${twofaEscape(account.id)}">删除</button>
      </div>
    </div>`;
}

function twofaRenderDetail(account) {
  const host = twofaEl('twofaDetailPanel');
  if (!host) return;
  if (!account) {
    host.innerHTML = `
      <div class="twofa-detail-empty">
        <div>
          <div class="twofa-detail-kicker">SYSTEM CHECK</div>
          <div class="twofa-detail-title">请选择一个账号</div>
          <div class="twofa-detail-subtitle">右侧会显示当前验证码、剩余时间和管理入口。</div>
        </div>
      </div>`;
    return;
  }

  const currentCode = twofaCodeText(account.currentCode);
  const remainingSeconds = Math.max(0, Number(account.remainingSeconds) || 0);
  const progress = account.period ? Math.max(0, Math.min(100, ((account.period - remainingSeconds) / account.period) * 100)) : 0;
  const favoriteActionText = account.favorite ? '取消收藏' : '收藏';
  const favoriteBtnClass = account.favorite ? ' btn--warning' : '';

  host.innerHTML = `
    <div class="twofa-detail-panel" data-twofa-detail-id="${twofaEscape(account.id)}">
      <div class="twofa-detail-head">
        <div class="twofa-detail-name">
          <div class="twofa-detail-kicker">CURRENT CODE</div>
          <div class="twofa-detail-title" title="${twofaEscape(account.issuer)}">${twofaEscape(account.issuer)}</div>
          <div class="twofa-detail-subtitle" title="${twofaEscape(account.accountName)}">${twofaEscape(account.accountName)}</div>
        </div>
        <div class="twofa-detail-badges">
          <span class="twofa-badge">${twofaEscape(account.groupName || '其他')}</span>
          ${account.tag ? `<span class="twofa-badge">${twofaEscape(account.tag)}</span>` : ''}
          ${account.favorite ? `<span class="twofa-badge favorite">★ 收藏</span>` : ''}
        </div>
      </div>

      <div class="twofa-code-hero">
        <div class="twofa-ring" style="--pct:${progress}%">
          <div class="twofa-ring-inner">
            <div class="twofa-ring-label">剩余</div>
            <div class="twofa-ring-value" data-twofa-detail-countdown>${twofaEscape(remainingSeconds ? `${remainingSeconds}s` : '0s')}</div>
            <div class="twofa-ring-sub">${Number(account.period) || 30}s 周期</div>
          </div>
        </div>
        <div class="twofa-code-hero-main">
          <div class="twofa-code-main">
            <div class="twofa-code-value" data-twofa-detail-code>${twofaEscape(currentCode)}</div>
            <button type="button" class="btn btn--primary twofa-code-copy" data-twofa-action="copy" data-twofa-id="${twofaEscape(account.id)}">复制验证码</button>
          </div>
          <div class="twofa-code-note">
            当前验证码由本机时间计算。<br>
            点击“复制”会同步更新最近使用记录。
          </div>
        </div>
      </div>

      <div class="twofa-meta-grid">
        <div class="twofa-meta-item">
          <div class="twofa-meta-label">算法 / 位数</div>
          <div class="twofa-meta-value">${twofaEscape(account.algorithm || 'SHA1')} · ${twofaEscape(account.digits || 6)} 位</div>
        </div>
        <div class="twofa-meta-item">
          <div class="twofa-meta-label">周期</div>
          <div class="twofa-meta-value">${twofaEscape(Number(account.period) || 30)} 秒</div>
        </div>
        <div class="twofa-meta-item">
          <div class="twofa-meta-label">密钥遮罩</div>
          <div class="twofa-meta-value">${twofaEscape(account.secretMasked || '—')}</div>
        </div>
        <div class="twofa-meta-item">
          <div class="twofa-meta-label">最近使用</div>
          <div class="twofa-meta-value">${twofaEscape(account.lastUsedAt ? twofaFormatDateTime((Number(account.lastUsedAt) || 0) * 1000) : '未使用')}</div>
        </div>
      </div>

      <div class="twofa-detail-actions">
        <button type="button" class="btn btn--primary" data-twofa-action="copy" data-twofa-id="${twofaEscape(account.id)}">复制验证码</button>
        <button type="button" class="btn" data-twofa-action="edit" data-twofa-id="${twofaEscape(account.id)}">编辑账号</button>
        <button type="button" class="btn${favoriteBtnClass}" data-twofa-action="favorite" data-twofa-id="${twofaEscape(account.id)}">${twofaEscape(favoriteActionText)}</button>
        <button type="button" class="btn btn--danger" data-twofa-action="delete" data-twofa-id="${twofaEscape(account.id)}">删除账号</button>
      </div>
    </div>`;
}

function twofaRenderEmptyDetail(message) {
  const host = twofaEl('twofaDetailPanel');
  if (!host) return;
  host.innerHTML = `
    <div class="twofa-detail-empty">
      <div>
        <div class="twofa-detail-kicker">2FA</div>
        <div class="twofa-detail-title">${twofaEscape(message || '暂无账号')}</div>
        <div class="twofa-detail-subtitle">先添加一个账号，或导入你已有的 otpauth / JSON 数据。</div>
      </div>
    </div>`;
}

function twofaUpdateCounters() {
  const now = Date.now();
  const selected = twofaState.accountsById.get(twofaState.selectedId) || null;
  const detailCountdown = twofaEl('twofaDetailPanel')?.querySelector('[data-twofa-detail-countdown]');
  const detailCode = twofaEl('twofaDetailPanel')?.querySelector('[data-twofa-detail-code]');
  const detailRing = twofaEl('twofaDetailPanel')?.querySelector('.twofa-ring');

  twofaState.accounts.forEach(account => {
    const expiresAt = Number(account.expiresAt) || 0;
    const period = Number(account.period) || 30;
    const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
    const pct = period ? Math.max(0, Math.min(100, ((period - remaining) / period) * 100)) : 0;
    const countdownText = twofaFormatRelativeSeconds(remaining);

    const countdownEls = document.querySelectorAll(`[data-twofa-countdown-for="${twofaSelectorValue(account.id)}"]`);
    countdownEls.forEach(el => {
      if (el.classList.contains('twofa-countdown')) {
        el.innerHTML = `${twofaEscape(countdownText)}<small> · ${twofaEscape(period)}s</small>`;
      } else {
        el.textContent = countdownText;
      }
    });

    const row = document.querySelector(`.twofa-row[data-twofa-id="${twofaSelectorValue(account.id)}"]`);
    if (row) {
      row.dataset.twofaExpiresAt = String(expiresAt || 0);
      const progressEl = row.querySelector('.twofa-progress > span');
      if (progressEl) progressEl.style.setProperty('--pct', `${pct}%`);
    }

    if (detailCountdown && selected && selected.id === account.id) {
      detailCountdown.textContent = remaining ? `${remaining}s` : '0s';
    }
    if (detailRing && selected && selected.id === account.id) {
      detailRing.style.setProperty('--pct', `${pct}%`);
    }
    if (detailCode && selected && selected.id === account.id) {
      detailCode.textContent = twofaCodeText(account.currentCode);
    }
  });
}

function twofaPickSelectedId(filtered) {
  if (!filtered.length) return '';
  if (filtered.some(item => item.id === twofaState.selectedId)) return twofaState.selectedId;
  return filtered[0]?.id || '';
}

function twofaRenderAll() {
  const filtered = twofaSortAccounts(twofaGetFilteredAccounts());
  twofaState.filtered = filtered;
  twofaState.selectedId = twofaPickSelectedId(filtered);

  const selected = twofaState.accountsById.get(twofaState.selectedId) || null;
  twofaRenderGroupChips();
  twofaRenderRecentStrip(twofaState.accounts);
  twofaRenderRows(filtered);
  if (selected) twofaRenderDetail(selected);
  else if (twofaState.accounts.length) twofaRenderEmptyDetail('没有匹配到当前筛选条件');
  else twofaRenderEmptyDetail('还没有任何账号');
  twofaUpdateMeta();
  twofaUpdateCounters();
}

function twofaUpdateMeta() {
  const status = twofaEl('twofaStatusText');
  const listMeta = twofaEl('twofaListMeta');
  const recentMeta = twofaEl('twofaRecentMeta');
  const total = twofaState.stats.total || 0;
  const favorites = twofaState.stats.favorites || 0;
  const groupCount = Object.keys(twofaState.stats.groups || {}).length;
  if (status) {
    status.textContent = twofaState.lastError
      ? `刷新失败：${twofaState.lastError}`
      : `已同步 ${total} 个账号 · ${twofaFormatClock(twofaState.lastSyncAt)}`;
  }
  if (listMeta) {
    listMeta.textContent = `${twofaState.filtered.length} 条 · ${groupCount} 组 · ${favorites} 个收藏`;
  }
  if (recentMeta && !twofaState.accounts.some(item => item.lastUsedAt)) {
    recentMeta.textContent = '最近使用记录会在“复制验证码”后出现';
  }
}

function twofaScheduleTick() {
  if (twofaState.countdownTimer) return;
  twofaState.countdownTimer = setInterval(() => {
    if (!twofaIsActive()) return;
    twofaUpdateCounters();
  }, 1000);
}

function twofaSchedulePoll() {
  if (twofaState.refreshTimer) return;
  twofaState.refreshTimer = setInterval(() => {
    if (!twofaIsActive()) return;
    twofaReload(true).catch(() => {});
  }, 5000);
}

function twofaStopPolling() {
  if (twofaState.countdownTimer) {
    clearInterval(twofaState.countdownTimer);
    twofaState.countdownTimer = null;
  }
  if (twofaState.refreshTimer) {
    clearInterval(twofaState.refreshTimer);
    twofaState.refreshTimer = null;
  }
}

async function twofaReload(silent = false) {
  if (twofaState.loading && twofaState.loadPromise) return twofaState.loadPromise;
  const seq = ++twofaState.loadSeq;
  twofaState.loading = true;
  twofaState.lastError = '';
  if (!silent) {
    const status = twofaEl('twofaStatusText');
    if (status) status.textContent = '正在加载…';
  }
  const promise = (async () => {
    try {
      const data = await API.get('/api/twofa/accounts');
      if (seq !== twofaState.loadSeq) return data;
      twofaState.accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      twofaState.accountsById = new Map(twofaState.accounts.map(item => [item.id, item]));
      twofaState.stats = data?.stats || { total: twofaState.accounts.length, favorites: 0, groups: {} };
      twofaState.lastSyncAt = Date.now();
      twofaState.filtered = twofaSortAccounts(twofaGetFilteredAccounts());
      if (!twofaState.selectedId || !twofaState.filtered.some(item => item.id === twofaState.selectedId)) {
        twofaState.selectedId = twofaState.filtered[0]?.id || twofaState.accounts[0]?.id || '';
      }
      twofaRenderAll();
      return data;
    } catch (err) {
      twofaState.lastError = err?.message || '未知错误';
      twofaUpdateMeta();
      if (!twofaState.accounts.length) {
        twofaRenderEmptyDetail(twofaState.lastError);
      }
      if (!silent) {
        await showAlert(`加载 2FA 账号失败：${twofaState.lastError}`, { icon: '❌' });
      }
      throw err;
    } finally {
      if (seq === twofaState.loadSeq) {
        twofaState.loading = false;
        twofaState.loadPromise = null;
      }
    }
  })();
  twofaState.loadPromise = promise;
  return promise;
}

function twofaSelectAccount(id) {
  if (!id) return;
  twofaState.selectedId = id;
  twofaRenderAll();
}

function twofaSetGroup(group) {
  twofaState.selectedGroup = group || 'all';
  twofaRenderAll();
}

function twofaSetSearch(value) {
  twofaState.query = twofaNormalizeText(value);
  twofaRenderAll();
}

function twofaGetCurrentAccount(id) {
  return twofaState.accountsById.get(id) || null;
}

async function twofaWriteClipboard(text) {
  const content = String(text ?? '');
  if (!content) throw new Error('没有可复制内容');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = content;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

async function twofaTouchAccount(id) {
  if (!id) return;
  try {
    await API.post(`/api/twofa/accounts/${encodeURIComponent(id)}/touch`, {});
  } catch (err) {
    console.warn('[2FA] touch failed:', err);
  }
}

async function twofaCopyCode(id) {
  const account = twofaGetCurrentAccount(id);
  if (!account) return;
  try {
    const code = twofaCodeText(account.currentCode);
    if (!code || code === '------') throw new Error('当前没有可复制的验证码');
    await twofaWriteClipboard(code);
    await twofaTouchAccount(id);
    twofaState.accountsById.set(id, {
      ...account,
      lastUsedAt: Math.floor(Date.now() / 1000),
    });
    twofaState.accounts = twofaState.accounts.map(item => item.id === id ? twofaState.accountsById.get(id) : item);
    twofaRenderAll();
    showToast('📋 已复制验证码', `${account.issuer} · ${account.accountName}`);
  } catch (err) {
    await showAlert(err.message || '复制失败', { icon: '❌' });
  }
}

async function twofaToggleFavorite(id) {
  const account = twofaGetCurrentAccount(id);
  if (!account) return;
  try {
    const result = await API.put(`/api/twofa/accounts/${encodeURIComponent(id)}`, {
      favorite: account.favorite ? 0 : 1,
    });
    if (result?.account) {
      twofaState.accountsById.set(id, result.account);
      twofaState.accounts = twofaState.accounts.map(item => item.id === id ? result.account : item);
      twofaRenderAll();
      showToast(result.account.favorite ? '★ 已收藏' : '☆ 已取消收藏', `${result.account.issuer} · ${result.account.accountName}`);
    } else {
      await twofaReload(true);
    }
  } catch (err) {
    await showAlert(`更新收藏失败：${err.message}`, { icon: '❌' });
  }
}

async function twofaDeleteAccount(id) {
  const account = twofaGetCurrentAccount(id);
  if (!account) return;
  const ok = await showConfirm(`确定删除账号「${account.issuer} / ${account.accountName}」？`, {
    icon: '🗑️',
    danger: true,
    confirmText: '删除',
  });
  if (!ok) return;
  try {
    await API.delete(`/api/twofa/accounts/${encodeURIComponent(id)}`);
    if (twofaState.selectedId === id) twofaState.selectedId = '';
    twofaState.accounts = twofaState.accounts.filter(item => item.id !== id);
    twofaState.accountsById.delete(id);
    twofaState.stats.total = twofaState.accounts.length;
    twofaState.stats.favorites = twofaState.accounts.filter(item => item.favorite).length;
    const nextGroups = {};
    for (const item of twofaState.accounts) nextGroups[item.groupName || '其他'] = (nextGroups[item.groupName || '其他'] || 0) + 1;
    twofaState.stats.groups = nextGroups;
    twofaRenderAll();
    showToast('🗑️ 已删除账号', `${account.issuer} · ${account.accountName}`);
  } catch (err) {
    await showAlert(`删除失败：${err.message}`, { icon: '❌' });
  }
}

function twofaOpenModal(id) {
  const modal = twofaEl(id);
  if (modal) modal.classList.add('active');
}

function twofaCloseModal(id) {
  closeModal(id);
}

function twofaOpenAdd() {
  const form = twofaEl('twofaAccountForm');
  if (!form) return;
  form.reset();
  twofaEl('twofaAccountId').value = '';
  twofaEl('twofaAccountModalTitle').textContent = '添加账号';
  twofaEl('twofaAccountModalSubtitle').textContent = '保存为本地加密数据，密钥不会外发。';
  twofaEl('twofaPeriod').value = '30';
  twofaEl('twofaDigits').value = '6';
  twofaEl('twofaAlgorithm').value = 'SHA1';
  twofaEl('twofaGroupName').value = '其他';
  twofaEl('twofaFavorite').checked = false;
  twofaEl('twofaSecret').value = '';
  twofaOpenModal('twofaAccountModal');
}

function twofaOpenEdit(id) {
  const account = twofaGetCurrentAccount(id);
  if (!account) return;
  twofaEl('twofaAccountId').value = account.id;
  twofaEl('twofaAccountModalTitle').textContent = '编辑账号';
  twofaEl('twofaAccountModalSubtitle').textContent = '不填写密钥时会保留原有密钥。';
  twofaEl('twofaIssuer').value = account.issuer || '';
  twofaEl('twofaAccountName').value = account.accountName || '';
  twofaEl('twofaGroupName').value = account.groupName || '其他';
  twofaEl('twofaTag').value = account.tag || '';
  twofaEl('twofaAlgorithm').value = account.algorithm || 'SHA1';
  twofaEl('twofaPeriod').value = String(account.period || 30);
  twofaEl('twofaDigits').value = String(account.digits || 6);
  twofaEl('twofaFavorite').checked = !!account.favorite;
  twofaEl('twofaSecret').value = '';
  twofaOpenModal('twofaAccountModal');
}

async function twofaSaveAccountFromForm(event) {
  event.preventDefault();
  const id = twofaEl('twofaAccountId').value.trim();
  const issuer = twofaEl('twofaIssuer').value.trim();
  const accountName = twofaEl('twofaAccountName').value.trim();
  const groupName = twofaEl('twofaGroupName').value.trim() || '其他';
  const tag = twofaEl('twofaTag').value.trim();
  const algorithm = twofaEl('twofaAlgorithm').value.trim() || 'SHA1';
  const period = Number(twofaEl('twofaPeriod').value) || 30;
  const digits = Number(twofaEl('twofaDigits').value) || 6;
  const favorite = !!twofaEl('twofaFavorite').checked;
  const secret = twofaEl('twofaSecret').value.trim();
  const isOtpAuth = /^otpauth:\/\//i.test(secret);

  if ((!issuer || !accountName) && !isOtpAuth) {
    await showAlert('平台 / 服务 和账号名不能为空（或直接填写 otpauth 链接）', { icon: '⚠️' });
    return;
  }
  if (!id && !secret) {
    await showAlert('新建账号时必须填写 Secret 或 otpauth 链接', { icon: '⚠️' });
    return;
  }

  const payload = {
    issuer,
    accountName,
    groupName,
    tag,
    algorithm,
    period,
    digits,
    favorite,
  };
  if (secret) payload.secret = secret;
  else if (!id) payload.secret = '';

  const confirmText = id ? '保存修改' : '添加账号';
  try {
    const result = id
      ? await API.put(`/api/twofa/accounts/${encodeURIComponent(id)}`, payload)
      : await API.post('/api/twofa/accounts', payload);
    if (result?.account) {
      twofaState.accountsById.set(result.account.id, result.account);
      if (id) {
        twofaState.accounts = twofaState.accounts.map(item => item.id === result.account.id ? result.account : item);
      } else {
        twofaState.accounts.unshift(result.account);
      }
      twofaEl('twofaAccountModal').classList.remove('active');
      twofaState.selectedId = result.account.id;
      await twofaReload(true);
      showToast(id ? '已保存账号' : '已添加账号', `${result.account.issuer} · ${result.account.accountName}`);
    } else {
      await twofaReload(true);
    }
  } catch (err) {
    await showAlert(`${confirmText}失败：${err.message}`, { icon: '❌' });
  }
}

async function twofaOpenImport() {
  const textarea = twofaEl('twofaImportTextarea');
  if (textarea) textarea.value = '';
  twofaOpenModal('twofaImportModal');
}

function twofaNormalizeImportItem(item) {
  if (typeof item === 'string') {
    return { secret: item };
  }
  if (!item || typeof item !== 'object') return null;
  const normalized = { ...item };
  if (!normalized.secret && normalized.secretText) normalized.secret = normalized.secretText;
  if (!normalized.secret && normalized.otpauth) normalized.secret = normalized.otpauth;
  return normalized;
}

async function twofaConfirmImport() {
  const textarea = twofaEl('twofaImportTextarea');
  const raw = textarea ? textarea.value.trim() : '';
  if (!raw) {
    await showAlert('请先粘贴要导入的 JSON', { icon: '⚠️' });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await showAlert('JSON 解析失败，请检查格式', { icon: '❌' });
    return;
  }

  let items = [];
  if (Array.isArray(parsed)) items = parsed;
  else if (Array.isArray(parsed.accounts)) items = parsed.accounts;
  else items = [parsed];

  const accounts = items.map(twofaNormalizeImportItem).filter(Boolean);
  if (!accounts.length) {
    await showAlert('没有可导入的账号', { icon: '⚠️' });
    return;
  }

  try {
    const result = await API.post('/api/twofa/import', accounts);
    twofaEl('twofaImportModal').classList.remove('active');
    await twofaReload(true);
    showToast('已完成批量导入', `新增 ${result.created || 0} · 更新 ${result.updated || 0}`);
  } catch (err) {
    await showAlert(`导入失败：${err.message}`, { icon: '❌' });
  }
}

async function twofaExport() {
  try {
    const data = await API.get('/api/twofa/export');
    const blob = new Blob([JSON.stringify(data.accounts || [], null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `2fa-accounts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('⇓ 已导出 2FA 账号', `${(data.accounts || []).length} 条记录`);
  } catch (err) {
    await showAlert(`导出失败：${err.message}`, { icon: '❌' });
  }
}

function twofaBindOnce() {
  if (twofaState.bound) return;
  twofaState.bound = true;

  const search = twofaEl('twofaSearchInput');
  if (search) {
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        twofaSetSearch(search.value);
      }, 120);
    });
  }

  const chips = twofaEl('twofaGroupChips');
  if (chips) {
    chips.addEventListener('click', (event) => {
      const target = event.target.closest('[data-twofa-group]');
      if (!target) return;
      twofaSetGroup(target.dataset.twofaGroup || 'all');
    });
  }

  const strips = twofaEl('twofaRecentStrip');
  if (strips) {
    strips.addEventListener('click', (event) => {
      const target = event.target.closest('[data-twofa-select]');
      if (!target) return;
      twofaSelectAccount(target.dataset.twofaSelect);
    });
  }

  const blocks = twofaEl('twofaGroupBlocks');
  if (blocks) {
    blocks.addEventListener('click', (event) => {
      const row = event.target.closest('.twofa-row');
      const action = event.target.closest('[data-twofa-action]');
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        const id = action.dataset.twofaId;
        const type = action.dataset.twofaAction;
        if (type === 'copy') twofaCopyCode(id);
        if (type === 'edit') twofaOpenEdit(id);
        if (type === 'favorite') twofaToggleFavorite(id);
        if (type === 'delete') twofaDeleteAccount(id);
        return;
      }
      if (row && row.dataset.twofaId) {
        twofaSelectAccount(row.dataset.twofaId);
      }
    });
  }

  const form = twofaEl('twofaAccountForm');
  if (form) form.addEventListener('submit', twofaSaveAccountFromForm);
}

function initTwoFA() {
  twofaBindOnce();
  twofaScheduleTick();
  twofaSchedulePoll();
  twofaReload(true).catch(() => {});
}

window.initTwoFA = initTwoFA;
window.stopTwoFAPolling = twofaStopPolling;
window.twofaReload = twofaReload;
window.twofaOpenAdd = twofaOpenAdd;
window.twofaOpenEdit = twofaOpenEdit;
window.twofaOpenImport = twofaOpenImport;
window.twofaConfirmImport = twofaConfirmImport;
window.twofaExport = twofaExport;
window.twofaSetGroup = twofaSetGroup;
window.twofaSelectAccount = twofaSelectAccount;
window.twofaCopyCode = twofaCopyCode;
window.twofaToggleFavorite = twofaToggleFavorite;
window.twofaDeleteAccount = twofaDeleteAccount;
