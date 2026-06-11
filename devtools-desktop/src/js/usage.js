/**
 * 用量统计模块 — Claude Code 模型调用量与成本
 * 数据由 sidecar 解析 ~/.claude/projects 会话日志提供，页面激活期间每 30s 自动刷新
 * 趋势图基于 ECharts（js/vendor/echarts），颜色取自 CSS 变量并随主题切换自动重绘
 */
const usageState = {
  range: 'today',
  app: '',
  page: 1,
  pageSize: 15,
  model: '',
  models: [],
  inited: false,
  lastTrends: null,
  lastBucket: 'hour',
};

const USAGE_APP_NAMES = { claude: 'Claude Code', codex: 'Codex' };

let usageChart = null;
let usageChartObserved = false;

// ========== 工具 ==========

function usageFmtNum(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

function usageFmtWan(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  return n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : usageFmtNum(n);
}

function usageFmtMoney(v) {
  return (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function usageFmtCost(microUsd) {
  return '$' + ((Number(microUsd) || 0) / 1e6).toFixed(4);
}

function usageFmtTime(unixSec) {
  const d = new Date(unixSec * 1000);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Claude 的项目目录形如 -Users-ldy-personalTools（路径编码），取末段展示；
// Codex 的 projectDir 已是目录名本身，原样展示
function usageFmtProject(dir) {
  dir = String(dir || '');
  if (!dir) return '-';
  if (dir.startsWith('-')) {
    const seg = dir.split('-').filter(Boolean);
    return seg.length ? seg[seg.length - 1] : '-';
  }
  return dir;
}

function usageCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function usageHexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  if (h.length === 3) {
    const [r, g, b] = [...h].map(c => parseInt(c + c, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (h.length === 6) {
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
  }
  return hex;
}

function usageRangeParams() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 分桶粒度：今天 10 分钟、近 7 天/本月 按小时、全部 按天，悬浮可看精细时段明细
  let start = null, end = null, bucket = 'day';
  if (usageState.range === 'today') {
    start = todayStart;
    end = new Date(todayStart.getTime() + 86400000); // 完整 0-24 点
    bucket = 'min10';
  }
  else if (usageState.range === '7d') { start = new Date(todayStart.getTime() - 6 * 86400000); bucket = 'hour'; }
  else if (usageState.range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); bucket = 'hour'; }
  return {
    start: start ? Math.floor(start.getTime() / 1000) : '',
    end: end ? Math.floor(end.getTime() / 1000) : '',
    bucket,
  };
}

function usageQuery(extra) {
  const { start, end } = usageRangeParams();
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (usageState.app) params.set('app', usageState.app);
  for (const k in (extra || {})) params.set(k, extra[k]);
  const s = params.toString();
  return s ? '?' + s : '';
}

// ========== 初始化与刷新 ==========

function initUsage() {
  if (!usageState.inited) {
    usageState.inited = true;
    setInterval(() => {
      const pageEl = document.getElementById('page-usage');
      if (pageEl && pageEl.classList.contains('active')) refreshUsage(true);
    }, 30000);
  }
  refreshUsage();
}

async function refreshUsage(silent) {
  const { bucket } = usageRangeParams();
  try {
    const [summary, trends, models, rate] = await Promise.all([
      API.get('/api/usage/summary' + usageQuery()),
      API.get('/api/usage/trends' + usageQuery({ bucket })),
      API.get('/api/usage/models' + usageQuery()),
      API.get('/api/usage/rate').catch(() => null),
    ]);
    usageState.models = models;
    if (rate && rate.rate > 0) usageState.cnyRate = rate;
    renderUsageSummary(summary);
    renderUsageTrend(trends, bucket);
    renderUsageModels(models);
    await loadUsageLogs();
  } catch (e) {
    if (!silent) showToast('❌ 用量数据加载失败', e.message);
  }
}

function setUsageRange(range, el) {
  usageState.range = range;
  usageState.page = 1;
  document.querySelectorAll('#usageRangeChips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  refreshUsage();
}

function setUsageApp(app, el) {
  usageState.app = app;
  usageState.page = 1;
  usageState.model = '';
  document.querySelectorAll('#usageAppChips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  refreshUsage();
}

async function importCcSwitchUsage() {
  try {
    const r = await API.post('/api/usage/import-ccswitch', {});
    showToast('✅ 导入完成', `扫描 ${usageFmtNum(r.scanned)} 条记录，新导入 ${usageFmtNum(r.imported)} 条（重复跳过），并入定价 ${usageFmtNum(r.pricingImported || 0)} 条，历史成本已重算`);
    refreshUsage();
  } catch (e) {
    showToast('❌ 导入失败', e.message);
  }
}

async function forceUsageSync() {
  try {
    const r = await API.post('/api/usage/sync', {});
    const info = document.getElementById('usageSyncInfo');
    if (info) info.textContent = `已扫描 ${r.files} 个日志文件，更新 ${r.upserted} 条记录`;
    refreshUsage();
  } catch (e) {
    showToast('❌ 同步失败', e.message);
  }
}

// ========== 渲染 ==========

function renderUsageSummary(s) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('usageTotalTokens', usageFmtNum(s.totalTokens));
  set('usageTotalTokensApprox', s.totalTokens >= 10000 ? '≈ ' + usageFmtWan(s.totalTokens) : '');
  set('usageRequests', usageFmtNum(s.requests));
  set('usageCost', '$' + usageFmtMoney(s.costUsd));
  const cnyEl = document.getElementById('usageCostCny');
  if (cnyEl) {
    const r = usageState.cnyRate;
    if (r && r.rate > 0) {
      cnyEl.textContent = '≈ ¥' + usageFmtMoney((s.costUsd || 0) * r.rate);
      cnyEl.title = `按 1 USD = ${r.rate.toFixed(4)} CNY 折算（${r.source === 'fallback' ? '离线兜底汇率' : '汇率来源 ' + r.source}）`;
    } else {
      cnyEl.textContent = '';
    }
  }
  set('usageCacheRate', (s.cacheHitRate * 100).toFixed(1) + '%');
  set('usageInputTokens', usageFmtWan(s.inputTokens));
  set('usageOutputTokens', usageFmtWan(s.outputTokens));
  set('usageCacheCreation', usageFmtWan(s.cacheCreationTokens));
  set('usageCacheRead', usageFmtWan(s.cacheReadTokens));
  const bar = document.getElementById('usageCacheRateBar');
  if (bar) bar.style.width = Math.min(100, s.cacheHitRate * 100).toFixed(1) + '%';
}

function renderUsageTrend(trends, bucket) {
  const el = document.getElementById('usageTrendChart');
  if (!el) return;
  usageState.lastTrends = trends;
  usageState.lastBucket = bucket;

  if (!trends || !trends.length) {
    if (usageChart) { usageChart.dispose(); usageChart = null; }
    el.innerHTML = '<div class="usage-empty">所选时间范围内暂无用量数据</div>';
    return;
  }

  if (!usageChart) {
    el.innerHTML = '';
    usageChart = echarts.init(el);
    if (!usageChartObserved) {
      usageChartObserved = true;
      new ResizeObserver(() => { if (usageChart) usageChart.resize(); }).observe(el);
      // 跟随明暗主题切换重绘
      new MutationObserver(() => {
        if (usageChart && usageState.lastTrends) renderUsageTrend(usageState.lastTrends, usageState.lastBucket);
      }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  const labels = trends.map(t => bucket === 'day' ? t.bucket.slice(5) : t.bucket.slice(11));
  const tokens = trends.map(t => (t.inputTokens || 0) + (t.outputTokens || 0) + (t.cacheReadTokens || 0) + (t.cacheCreationTokens || 0));
  const costs = trends.map(t => (t.costMicroUsd || 0) / 1e6);

  const cPrimary = usageCssVar('--primary') || '#6366f1';
  const cDanger = usageCssVar('--danger') || '#ef4444';
  const cSuccess = usageCssVar('--success') || '#22c55e';
  const cMuted = usageCssVar('--text-muted') || '#94a3b8';
  const cBorder = usageCssVar('--border-strong') || 'rgba(148,163,184,.25)';
  const cBg = usageCssVar('--bg-elevated') || '#1e293b';
  const cText = usageCssVar('--text-primary') || '#e2e8f0';

  usageChart.setOption({
    animationDuration: 300,
    grid: { left: 16, right: 16, top: 24, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: cBorder } },
      backgroundColor: cBg,
      borderColor: cBorder,
      textStyle: { color: cText, fontSize: 12 },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const t = trends[i];
        const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:22px;line-height:1.8"><span style="color:${cMuted}">${k}</span><b style="font-family:monospace">${v}</b></div>`;
        return `<div style="font-family:monospace;font-weight:600;margin-bottom:4px">${t.bucket}</div>` +
          row('请求数', usageFmtNum(t.requests)) +
          row('Tokens 合计', usageFmtNum(tokens[i])) +
          row('新增输入', usageFmtNum(t.inputTokens)) +
          row('输出', usageFmtNum(t.outputTokens)) +
          row('缓存创建', usageFmtNum(t.cacheCreationTokens)) +
          row('缓存命中', usageFmtNum(t.cacheReadTokens)) +
          row('成本', `<span style="color:${cSuccess}">$${costs[i].toFixed(4)}</span>`);
      },
    },
    legend: {
      data: ['Tokens', '成本'], bottom: 0,
      textStyle: { color: cMuted }, icon: 'roundRect', itemWidth: 14, itemHeight: 4,
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: labels,
      axisLine: { lineStyle: { color: cBorder } },
      axisLabel: { color: cMuted, fontFamily: 'monospace', hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: cBorder, type: 'dashed', opacity: 0.6 } },
        axisLabel: {
          color: cMuted, fontFamily: 'monospace',
          formatter: (v) => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
        },
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { color: cMuted, fontFamily: 'monospace', formatter: (v) => '$' + (v >= 10 ? v.toFixed(0) : v.toFixed(1)) },
      },
    ],
    series: [
      {
        name: 'Tokens', type: 'line', smooth: 0.3,
        showSymbol: false, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2, color: cPrimary }, itemStyle: { color: cPrimary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: usageHexToRgba(cPrimary, 0.32) },
            { offset: 1, color: usageHexToRgba(cPrimary, 0.02) },
          ]),
        },
        data: tokens,
      },
      {
        name: '成本', type: 'line', smooth: 0.3, yAxisIndex: 1,
        showSymbol: false, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, type: 'dashed', color: cDanger }, itemStyle: { color: cDanger },
        data: costs,
      },
    ],
  }, true);
}

function renderUsageModels(models) {
  const el = document.getElementById('usageModelTable');
  if (!el) return;
  if (!models || !models.length) {
    el.innerHTML = '<div class="usage-empty">暂无数据</div>';
    return;
  }
  el.innerHTML = `<table class="usage-table">
    <thead><tr>
      <th>模型</th><th>请求数</th><th>新增输入</th><th>输出</th><th>缓存创建</th><th>缓存命中</th><th>成本</th>
    </tr></thead>
    <tbody>${models.map(m => `<tr>
      <td><span class="usage-model-name">${m.displayName}</span><span class="usage-model-id">${m.model}</span><span class="usage-app-badge usage-app-${m.appType}">${USAGE_APP_NAMES[m.appType] || m.appType}</span>${m.pricingModel ? '' : '<span class="usage-badge-warn">未匹配单价</span>'}</td>
      <td>${usageFmtNum(m.requests)}</td>
      <td>${usageFmtWan(m.inputTokens)}</td>
      <td>${usageFmtWan(m.outputTokens)}</td>
      <td>${usageFmtWan(m.cacheCreationTokens)}</td>
      <td>${usageFmtWan(m.cacheReadTokens)}</td>
      <td class="usage-cost-cell">${usageFmtCost(m.costMicroUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  // 同步模型筛选下拉
  const sel = document.getElementById('usageModelFilter');
  if (sel) {
    const current = usageState.model;
    sel.innerHTML = '<option value="">全部模型</option>' +
      models.map(m => `<option value="${m.model}"${m.model === current ? ' selected' : ''}>${m.displayName}</option>`).join('');
  }
}

async function loadUsageLogs() {
  const extra = { page: usageState.page, pageSize: usageState.pageSize };
  if (usageState.model) extra.model = usageState.model;
  const data = await API.get('/api/usage/logs' + usageQuery(extra));
  renderUsageLogs(data);
}

function renderUsageLogs(data) {
  const el = document.getElementById('usageLogTable');
  const pager = document.getElementById('usagePager');
  if (!el) return;
  if (!data.rows.length) {
    el.innerHTML = '<div class="usage-empty">暂无请求日志</div>';
    if (pager) pager.innerHTML = '';
    return;
  }
  el.innerHTML = `<table class="usage-table">
    <thead><tr>
      <th>时间</th><th>模型</th><th>项目</th><th>新增输入</th><th>输出</th><th>缓存创建</th><th>缓存命中</th><th>成本</th>
    </tr></thead>
    <tbody>${data.rows.map(r => `<tr>
      <td class="usage-mono">${usageFmtTime(r.createdAt)}</td>
      <td class="usage-mono">${r.model}</td>
      <td>${usageFmtProject(r.projectDir)}</td>
      <td>${usageFmtNum(r.inputTokens)}</td>
      <td>${usageFmtNum(r.outputTokens)}</td>
      <td>${usageFmtNum(r.cacheCreationTokens)}</td>
      <td>${usageFmtNum(r.cacheReadTokens)}</td>
      <td class="usage-cost-cell">${usageFmtCost(r.costMicroUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  if (pager) {
    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    pager.innerHTML = `
      <button class="btn-secondary usage-pager-btn" ${data.page <= 1 ? 'disabled' : ''} onclick="usageGoPage(${data.page - 1})">上一页</button>
      <span class="usage-pager-info">第 ${data.page} / ${totalPages} 页 · 共 ${usageFmtNum(data.total)} 条</span>
      <button class="btn-secondary usage-pager-btn" ${data.page >= totalPages ? 'disabled' : ''} onclick="usageGoPage(${data.page + 1})">下一页</button>`;
  }
}

function usageGoPage(page) {
  usageState.page = Math.max(1, page);
  loadUsageLogs().catch(e => showToast('❌ 日志加载失败', e.message));
}

function setUsageModelFilter(model) {
  usageState.model = model;
  usageState.page = 1;
  loadUsageLogs().catch(e => showToast('❌ 日志加载失败', e.message));
}

// ========== 单价设置 ==========

async function toggleUsagePricing() {
  const card = document.getElementById('usagePricingCard');
  if (!card) return;
  const show = card.style.display === 'none';
  card.style.display = show ? '' : 'none';
  if (show) await loadUsagePricing();
}

async function loadUsagePricing() {
  const el = document.getElementById('usagePricingTable');
  if (!el) return;
  const rows = await API.get('/api/usage/pricing');
  el.innerHTML = `<table class="usage-table">
    <thead><tr>
      <th>模型 ID</th><th>显示名</th><th>输入</th><th>输出</th><th>缓存命中</th><th>缓存创建</th><th></th>
    </tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-model="${r.modelId}">
      <td class="usage-mono">${r.modelId}</td>
      <td><input class="usage-price-input usage-price-name" id="upName${i}" value="${r.displayName}"></td>
      <td><input class="usage-price-input" id="upIn${i}" type="number" step="0.01" value="${r.inputPerM}"></td>
      <td><input class="usage-price-input" id="upOut${i}" type="number" step="0.01" value="${r.outputPerM}"></td>
      <td><input class="usage-price-input" id="upCr${i}" type="number" step="0.001" value="${r.cacheReadPerM}"></td>
      <td><input class="usage-price-input" id="upCc${i}" type="number" step="0.01" value="${r.cacheCreationPerM}"></td>
      <td><button class="btn-secondary usage-pager-btn" onclick="saveUsagePricing('${r.modelId}', ${i})">保存</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function saveUsagePricing(modelId, i) {
  try {
    await API.put('/api/usage/pricing/' + encodeURIComponent(modelId), {
      displayName: document.getElementById('upName' + i).value,
      inputPerM: parseFloat(document.getElementById('upIn' + i).value) || 0,
      outputPerM: parseFloat(document.getElementById('upOut' + i).value) || 0,
      cacheReadPerM: parseFloat(document.getElementById('upCr' + i).value) || 0,
      cacheCreationPerM: parseFloat(document.getElementById('upCc' + i).value) || 0,
    });
    showToast('✅ 单价已保存', '历史成本已按新单价重算');
    refreshUsage();
  } catch (e) {
    showToast('❌ 保存失败', e.message);
  }
}
