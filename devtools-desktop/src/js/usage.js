/**
 * 用量统计模块 — Claude Code / Codex 模型调用量与成本
 * 数据由 sidecar 解析本地会话日志提供，页面激活期间每 30s 自动刷新
 * 图表基于 ECharts（js/vendor/echarts），颜色取自 CSS 变量并随主题切换自动重绘
 */
const usageState = {
  range: 'today',
  app: '',
  page: 1,
  pageSize: 15,
  model: '',
  models: [],
  inited: false,
  lastTrendSeries: null,
  lastBucket: 'min10',
};

const USAGE_APP_NAMES = { claude: 'Claude Code', codex: 'Codex' };
const USAGE_APP_SERIES = [
  { key: 'claude', name: 'Claude Code', cssVar: '--primary' },
  { key: 'codex', name: 'Codex', cssVar: '--success' },
];
const USAGE_SUBFEE_KEY = 'devtools-usage-subfee';

let usageChart = null;
let usageHeatChart = null;
let usageThemeObserved = false;

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

// 基于主色生成色阶：t>0 向白混合变亮，t<0 向黑混合变暗
function usageShadeColor(hex, t) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return hex;
  const target = t >= 0 ? 255 : 0;
  const f = Math.min(Math.abs(t), 1);
  const mix = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    return Math.round(c + (target - c) * f);
  };
  return `rgb(${mix(0)},${mix(2)},${mix(4)})`;
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
  // 分桶粒度：今天 10 分钟、近 7 天/本月 按小时、全部 按天
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

// 环比对照区间（全部范围无对照）
function usagePrevRange() {
  const now = new Date();
  const t = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  if (usageState.range === 'today') return { start: t - 86400, end: t, label: '较昨日' };
  if (usageState.range === '7d') {
    const s = t - 6 * 86400;
    return { start: s - 7 * 86400, end: s, label: '较前 7 天' };
  }
  if (usageState.range === 'month') {
    const mStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const pStart = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
    return { start: pStart, end: mStart, label: '较上月' };
  }
  return null;
}

function usagePrevQuery(prev) {
  const params = new URLSearchParams({ start: prev.start, end: prev.end });
  if (usageState.app) params.set('app', usageState.app);
  return '?' + params.toString();
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
  const prev = usagePrevRange();
  const seriesDefs = usageState.app
    ? USAGE_APP_SERIES.filter(s => s.key === usageState.app)
    : USAGE_APP_SERIES;
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  try {
    const results = await Promise.all([
      API.get('/api/usage/summary' + usageQuery()),
      API.get('/api/usage/models' + usageQuery()),
      API.get('/api/usage/projects' + usageQuery()),
      API.get('/api/usage/top' + usageQuery({ limit: 10 })),
      API.get('/api/usage/rate').catch(() => null),
      API.get('/api/usage/summary?start=' + monthStart).catch(() => null), // ROI 按全量本月
      prev ? API.get('/api/usage/summary' + usagePrevQuery(prev)).catch(() => null) : Promise.resolve(null),
      ...seriesDefs.map(s => API.get('/api/usage/trends' + usageQuery({ bucket, app: s.key }))),
    ]);
    const [summary, models, projects, top, rate, monthSummary, prevSummary] = results;
    const trendSeries = results.slice(7).map((trends, i) => ({ ...seriesDefs[i], trends }));
    usageState.models = models;
    if (rate && rate.rate > 0) usageState.cnyRate = rate;
    renderUsageSummary(summary);
    renderUsageDeltas(summary, prevSummary, prev ? prev.label : '');
    renderUsageRoi(monthSummary);
    renderUsageTrend(trendSeries, bucket);
    renderUsageProjects(projects);
    renderUsageCostPie(models);
    renderUsageTop(top);
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

// ========== 订阅回本 ==========

function usageGetSubFee() {
  return parseFloat(localStorage.getItem(USAGE_SUBFEE_KEY)) || 0;
}

async function editSubscriptionFee() {
  const v = await showPrompt('每月订阅总费用（USD，Claude / Codex 等合计）', {
    defaultValue: usageGetSubFee() || '',
    placeholder: '如 220',
    icon: '💳',
  });
  if (v === null || v === undefined || v === '') return;
  const fee = parseFloat(v);
  if (!Number.isFinite(fee) || fee <= 0) { showToast('❌ 请输入有效金额', '需要大于 0 的数字'); return; }
  localStorage.setItem(USAGE_SUBFEE_KEY, String(fee));
  refreshUsage();
}

function renderUsageRoi(monthSummary) {
  const valEl = document.getElementById('usageRoi');
  const subEl = document.getElementById('usageRoiSub');
  if (!valEl || !subEl) return;
  const fee = usageGetSubFee();
  if (!fee) {
    valEl.textContent = '--';
    subEl.textContent = '顶部「订阅设置」可配置月费';
    return;
  }
  const cost = monthSummary ? (monthSummary.costUsd || 0) : 0;
  valEl.textContent = (cost / fee).toFixed(1) + 'x';
  subEl.textContent = `本月 $${usageFmtMoney(cost)} / 订阅 $${usageFmtMoney(fee)}`;
}

// ========== 渲染：总览与环比 ==========

function renderUsageSummary(s) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('usageTotalTokens', usageFmtNum(s.totalTokens));
  set('usageTotalTokensApprox', s.totalTokens >= 10000 ? '≈ ' + usageFmtWan(s.totalTokens) : '');
  set('usageRequests', usageFmtNum(s.requests));
  set('usageCost', '$' + usageFmtMoney(s.costUsd));
  set('usageCacheRate', (s.cacheHitRate * 100).toFixed(1) + '%');
  set('usageCacheSaved', '$' + usageFmtMoney(s.cacheSavedUsd));
  set('usageInputTokens', usageFmtWan(s.inputTokens));
  set('usageOutputTokens', usageFmtWan(s.outputTokens));
  set('usageCacheCreation', usageFmtWan(s.cacheCreationTokens));
  set('usageCacheRead', usageFmtWan(s.cacheReadTokens));
  const bar = document.getElementById('usageCacheRateBar');
  if (bar) bar.style.width = Math.min(100, s.cacheHitRate * 100).toFixed(1) + '%';
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
}

function usageDeltaHTML(cur, prevVal, label, colorize) {
  if (!(prevVal > 0)) return '';
  const pct = ((Number(cur) || 0) - prevVal) / prevVal * 100;
  if (!Number.isFinite(pct)) return '';
  const up = pct >= 0;
  const cls = colorize ? (up ? ' usage-delta-up' : ' usage-delta-down') : '';
  return `<span class="usage-delta${cls}">${up ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}% ${label}</span>`;
}

function renderUsageDeltas(summary, prevSummary, label) {
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (!prevSummary || !label) {
    set('usageTokensDelta', ''); set('usageCostDelta', ''); set('usageReqDelta', '');
    return;
  }
  set('usageTokensDelta', usageDeltaHTML(summary.totalTokens, prevSummary.totalTokens, label, false));
  set('usageCostDelta', usageDeltaHTML(summary.costUsd, prevSummary.costUsd, label, true));
  set('usageReqDelta', usageDeltaHTML(summary.requests, prevSummary.requests, label, false));
}

// ========== 渲染：趋势图（按应用堆叠 + dataZoom） ==========

function ensureUsageThemeObserver() {
  if (usageThemeObserved) return;
  usageThemeObserved = true;
  new MutationObserver(() => {
    if (usageState.lastTrendSeries) renderUsageTrend(usageState.lastTrendSeries, usageState.lastBucket);
    if (usageState.models && usageState.models.length) renderUsageCostPie(usageState.models);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
}

function renderUsageTrend(seriesList, bucket) {
  const el = document.getElementById('usageTrendChart');
  if (!el) return;
  usageState.lastTrendSeries = seriesList;
  usageState.lastBucket = bucket;

  const base = seriesList.find(s => s.trends && s.trends.length);
  if (!base) {
    if (usageChart) { usageChart.dispose(); usageChart = null; }
    el.innerHTML = '<div class="usage-empty">所选时间范围内暂无用量数据</div>';
    return;
  }

  if (!usageChart) {
    el.innerHTML = '';
    usageChart = echarts.init(el);
    new ResizeObserver(() => { if (usageChart) usageChart.resize(); }).observe(el);
    ensureUsageThemeObserver();
  }

  const buckets = base.trends.map(t => t.bucket);
  // 小时粒度跨多天（近7天/本月）时，X 轴只在每天 0 点标注日期，悬浮仍精确到小时
  const multiDay = bucket !== 'day' && new Set(buckets.map(b => b.slice(0, 10))).size > 1;
  const tokensBySeries = seriesList.map(s =>
    (s.trends || []).map(t => (t.inputTokens || 0) + (t.outputTokens || 0) + (t.cacheReadTokens || 0) + (t.cacheCreationTokens || 0)));
  const costs = buckets.map((_, i) =>
    seriesList.reduce((acc, s) => acc + ((s.trends[i] && s.trends[i].costMicroUsd) || 0), 0) / 1e6);

  const cDanger = usageCssVar('--danger') || '#ef4444';
  const cSuccess = usageCssVar('--success') || '#22c55e';
  const cMuted = usageCssVar('--text-muted') || '#94a3b8';
  const cBorder = usageCssVar('--border-strong') || 'rgba(148,163,184,.25)';
  const cBg = usageCssVar('--bg-elevated') || '#1e293b';
  const cText = usageCssVar('--text-primary') || '#e2e8f0';
  const seriesColors = seriesList.map(s => usageCssVar(s.cssVar) || '#6366f1');

  const tokenSeries = seriesList.map((s, si) => ({
    name: s.name, type: 'line', stack: 'tokens', smooth: 0.3,
    showSymbol: false, symbol: 'circle', symbolSize: 5,
    lineStyle: { width: 1.5, color: seriesColors[si] },
    itemStyle: { color: seriesColors[si] },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: usageHexToRgba(seriesColors[si], 0.4) },
        { offset: 1, color: usageHexToRgba(seriesColors[si], 0.06) },
      ]),
    },
    data: tokensBySeries[si],
  }));

  usageChart.setOption({
    animationDuration: 300,
    grid: { left: 16, right: 16, top: 24, bottom: 76, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: cBorder } },
      backgroundColor: cBg,
      borderColor: cBorder,
      textStyle: { color: cText, fontSize: 12 },
      formatter: (params) => {
        const i = params[0].dataIndex;
        const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:22px;line-height:1.8"><span style="color:${cMuted}">${k}</span><b style="font-family:monospace">${v}</b></div>`;
        let html = `<div style="font-family:monospace;font-weight:600;margin-bottom:4px">${base.trends[i].bucket}</div>`;
        let totTokens = 0, totReq = 0;
        seriesList.forEach((s, si) => {
          const tk = tokensBySeries[si][i] || 0;
          totTokens += tk;
          totReq += (s.trends[i] && s.trends[i].requests) || 0;
          if (seriesList.length > 1) {
            html += row(`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${seriesColors[si]};margin-right:6px"></span>${s.name}`, usageFmtNum(tk));
          }
        });
        html += row('Tokens 合计', usageFmtNum(totTokens));
        html += row('请求数', usageFmtNum(totReq));
        html += row('成本', `<span style="color:${cSuccess}">$${costs[i].toFixed(4)}</span>`);
        return html;
      },
    },
    legend: {
      data: [...seriesList.map(s => s.name), '成本'], bottom: 24,
      textStyle: { color: cMuted }, icon: 'roundRect', itemWidth: 14, itemHeight: 4,
    },
    dataZoom: [
      { type: 'inside', throttle: 50 },
      {
        type: 'slider', height: 16, bottom: 0,
        borderColor: 'transparent',
        backgroundColor: usageHexToRgba(cMuted, 0.06),
        fillerColor: usageHexToRgba(seriesColors[0], 0.14),
        handleStyle: { color: seriesColors[0] },
        moveHandleSize: 0, showDetail: false,
        textStyle: { color: cMuted, fontSize: 10 },
      },
    ],
    xAxis: {
      type: 'category', boundaryGap: false, data: buckets,
      axisLine: { lineStyle: { color: cBorder } },
      axisLabel: {
        color: cMuted, fontFamily: 'monospace', hideOverlap: true,
        formatter: (val) => {
          if (bucket === 'day') return val.slice(5);
          if (multiDay) return val.slice(11, 16) === '00:00' ? val.slice(5, 10) : '';
          return val.slice(11);
        },
        interval: multiDay ? ((idx) => buckets[idx].slice(11, 16) === '00:00') : 'auto',
      },
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
      ...tokenSeries,
      {
        name: '成本', type: 'line', smooth: 0.3, yAxisIndex: 1,
        showSymbol: false, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, type: 'dashed', color: cDanger }, itemStyle: { color: cDanger },
        data: costs,
      },
    ],
  }, true);
}

// ========== 渲染：项目统计 ==========

function renderUsageProjects(projects) {
  const el = document.getElementById('usageProjectTable');
  if (!el) return;
  if (!projects || !projects.length) {
    el.innerHTML = '<div class="usage-empty">暂无数据</div>';
    return;
  }
  const maxCost = Math.max(...projects.map(p => p.costMicroUsd), 1);
  el.innerHTML = `<table class="usage-table">
    <thead><tr><th>项目</th><th>应用</th><th>请求数</th><th>Tokens</th><th>成本</th></tr></thead>
    <tbody>${projects.map(p => {
      const tokens = p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreationTokens;
      const width = Math.max(2, p.costMicroUsd / maxCost * 100).toFixed(1);
      return `<tr>
        <td class="usage-project-cell">
          <div class="usage-model-name usage-project-name" title="${p.project}">${p.project}</div>
          <div class="usage-project-bar"><div style="width:${width}%"></div></div>
        </td>
        <td>${p.apps.map(a => `<span class="usage-app-badge usage-app-${a}">${USAGE_APP_NAMES[a] || a}</span>`).join('')}</td>
        <td>${usageFmtNum(p.requests)}</td>
        <td>${usageFmtWan(tokens)}</td>
        <td class="usage-cost-cell">${usageFmtCost(p.costMicroUsd)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ========== 渲染：成本构成环形图（按模型） ==========

function renderUsageCostPie(models) {
  const el = document.getElementById('usageCostPieChart');
  if (!el) return;
  const priced = (models || []).filter(m => m.costMicroUsd > 0);
  if (!priced.length) {
    if (usageHeatChart) { usageHeatChart.dispose(); usageHeatChart = null; }
    el.innerHTML = '<div class="usage-empty">暂无成本数据</div>';
    return;
  }
  if (!usageHeatChart) {
    el.innerHTML = '';
    usageHeatChart = echarts.init(el);
    new ResizeObserver(() => { if (usageHeatChart) usageHeatChart.resize(); }).observe(el);
    ensureUsageThemeObserver();
  }

  const cMuted = usageCssVar('--text-muted') || '#94a3b8';
  const cBorder = usageCssVar('--border-strong') || 'rgba(148,163,184,.25)';
  const cBg = usageCssVar('--bg-elevated') || '#1e293b';
  const cText = usageCssVar('--text-primary') || '#e2e8f0';

  const totalUsd = priced.reduce((a, m) => a + m.costMicroUsd, 0) / 1e6;
  const detail = new Map();

  // Apple 活力环风格：Top5 模型一人一环，环长 = 成本占比，成本最高的在最外环
  // 调色板由内到外（外环固定用主题紫，与全局视觉呼应）
  const RING_COLORS = ['#fb7185', '#fbbf24', '#34d399', '#22d3ee', '#7c6cf6'];
  const rings = [...priced].sort((a, b) => a.costMicroUsd - b.costMicroUsd).slice(-5);
  const names = rings.map(m => m.displayName);
  rings.forEach(m => detail.set(m.displayName, m));

  // 底部暗色轨道环
  const trackSeries = {
    type: 'bar', coordinateSystem: 'polar', silent: true, roundCap: true,
    barGap: '-100%', z: 1, animation: false,
    itemStyle: { color: usageHexToRgba(cMuted, 0.09) },
    data: names.map(() => 100),
  };
  const ringSeries = rings.map((m, i) => {
    const color = RING_COLORS[RING_COLORS.length - rings.length + i] || RING_COLORS[i % RING_COLORS.length];
    const realPct = totalUsd > 0 ? (m.costMicroUsd / 1e6 / totalUsd * 100) : 0;
    return {
      name: m.displayName, type: 'bar', coordinateSystem: 'polar', roundCap: true,
      barGap: '-100%', z: 2,
      data: names.map((n, j) => (j === i ? Math.max(realPct, 1.5) : null)),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 1, 1, 0, [
          { offset: 0, color: usageShadeColor(color, -0.22) },
          { offset: 1, color: usageShadeColor(color, 0.18) },
        ]),
        shadowBlur: 12, shadowColor: usageHexToRgba(color, 0.55),
      },
      animationDuration: 900, animationDelay: i * 150, animationEasing: 'cubicOut',
    };
  });

  usageHeatChart.setOption({
    title: {
      text: '$' + usageFmtMoney(totalUsd),
      subtext: '总成本',
      left: 'center', top: '40%',
      textStyle: { color: cText, fontSize: 16, fontFamily: 'monospace', fontWeight: 700 },
      subtextStyle: { color: cMuted, fontSize: 10 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: cBg, borderColor: cBorder, textStyle: { color: cText, fontSize: 12 },
      formatter: (p) => {
        const m = detail.get(p.seriesName);
        if (!m) return p.seriesName;
        const pct = totalUsd > 0 ? (m.costMicroUsd / 1e6 / totalUsd * 100).toFixed(1) : '0.0';
        const tokens = m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreationTokens;
        return `<b>${p.seriesName}</b><br/>成本：$${usageFmtMoney(m.costMicroUsd / 1e6)}（${pct}%）<br/>` +
               `请求数：${usageFmtNum(m.requests)}<br/>Tokens：${usageFmtWan(tokens)}<br/>` +
               `应用：${USAGE_APP_NAMES[m.appType] || m.appType}`;
      },
    },
    legend: {
      bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 14,
      textStyle: { color: cMuted, fontSize: 11 },
      data: [...names].reverse(), // 图例按成本从高到低
    },
    polar: { radius: ['24%', '90%'], center: ['50%', '46%'] },
    angleAxis: { max: 100, startAngle: 90, show: false },
    radiusAxis: {
      type: 'category', data: names,
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
    },
    series: [trackSeries, ...ringSeries],
  }, true);
}

// ========== 渲染：最贵请求 Top 10 ==========

function renderUsageTop(rows) {
  const el = document.getElementById('usageTopTable');
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="usage-empty">暂无数据</div>';
    return;
  }
  el.innerHTML = `<table class="usage-table">
    <thead><tr><th>#</th><th>时间</th><th>模型</th><th>项目</th><th>新增输入</th><th>输出</th><th>缓存创建</th><th>缓存命中</th><th>成本</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td class="usage-mono">${i + 1}</td>
      <td class="usage-mono">${usageFmtTime(r.createdAt)}</td>
      <td class="usage-mono">${r.model} <span class="usage-app-badge usage-app-${r.appType}">${USAGE_APP_NAMES[r.appType] || r.appType}</span></td>
      <td>${usageFmtProject(r.projectDir)}</td>
      <td>${usageFmtNum(r.inputTokens)}</td>
      <td>${usageFmtNum(r.outputTokens)}</td>
      <td>${usageFmtNum(r.cacheCreationTokens)}</td>
      <td>${usageFmtNum(r.cacheReadTokens)}</td>
      <td class="usage-cost-cell">${usageFmtCost(r.costMicroUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ========== 渲染：模型统计 ==========

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

// ========== 渲染：请求日志 ==========

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
