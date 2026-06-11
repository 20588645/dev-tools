/**
 * Claude Code 用量统计服务
 * 数据源：~/.claude/projects/ 下的会话日志（*.jsonl），即 Claude Code 每次
 * API 响应在本地落盘的 assistant 消息（含 model 与 usage 计数）。
 * 增量扫描按"文件字节偏移"续读，按 message.id 去重入库（同一响应的多个
 * 内容块共享 id，后写入的块带最终 usage，故用 REPLACE 让最后一条胜出）。
 * 成本以"微美元"整数存储：tokens × (USD/百万token) 恰好等于微美元数。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
// Codex 会话日志长期保留，归档目录与活跃目录格式一致
const CODEX_SESSION_DIRS = [
  path.join(os.homedir(), '.codex', 'sessions'),
  path.join(os.homedir(), '.codex', 'archived_sessions'),
];
const SYNC_THROTTLE_MS = 15000;
let lastSyncAt = 0;

// 默认单价（USD / 百万 token），与 cc-switch (MIT) 的 seed 数据对齐
// 格式: [modelId, displayName, input, output, cacheRead, cacheCreation]
const DEFAULT_PRICING = [
  ['claude-fable-5', 'Claude Fable 5', 10, 50, 1.0, 12.5],
  ['claude-opus-4-8', 'Claude Opus 4.8', 5, 25, 0.5, 6.25],
  ['claude-opus-4-7', 'Claude Opus 4.7', 5, 25, 0.5, 6.25],
  ['claude-opus-4-6-20260206', 'Claude Opus 4.6', 5, 25, 0.5, 6.25],
  ['claude-sonnet-4-6-20260217', 'Claude Sonnet 4.6', 3, 15, 0.3, 3.75],
  ['claude-opus-4-5-20251101', 'Claude Opus 4.5', 5, 25, 0.5, 6.25],
  ['claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 3, 15, 0.3, 3.75],
  ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1, 5, 0.1, 1.25],
  ['claude-opus-4-1-20250805', 'Claude Opus 4.1', 15, 75, 1.5, 18.75],
  ['claude-opus-4-20250514', 'Claude Opus 4', 15, 75, 1.5, 18.75],
  ['claude-sonnet-4-20250514', 'Claude Sonnet 4', 3, 15, 0.3, 3.75],
  ['claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 0.8, 4, 0.08, 1],
  ['claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 3, 15, 0.3, 3.75],
];

function ensurePricingSeed() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO model_pricing (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const row of DEFAULT_PRICING) insert.run(...row);
  });
  tx();
}

// ========== 模型定价匹配 ==========

// 生成候选 ID：原名 → 去供应商前缀/Bedrock 后缀 → 去日期后缀 → 点号转横线
function pricingCandidates(model) {
  const cands = [];
  const push = (v) => { if (v && !cands.includes(v)) cands.push(v); };
  let id = String(model || '').trim().toLowerCase();
  push(id);
  const slash = id.lastIndexOf('/');
  if (slash >= 0) { id = id.slice(slash + 1); push(id); }
  id = id.replace(/:\d+$/, '').replace(/-v\d+$/, '');
  push(id);
  push(id.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
  push(id.replace(/-\d{8}$/, ''));
  for (const c of cands.slice()) push(c.replace(/\./g, '-'));
  return cands;
}

const pricingCache = new Map();

function findPricing(model) {
  if (pricingCache.has(model)) return pricingCache.get(model);
  let found = null;
  const exact = db.prepare('SELECT * FROM model_pricing WHERE modelId = ?');
  for (const c of pricingCandidates(model)) {
    found = exact.get(c);
    if (found) break;
  }
  if (!found) {
    // 前缀匹配（取最短命中），处理"日志带日期后缀、定价表存短名"或反向的情况
    const like = db.prepare(
      'SELECT * FROM model_pricing WHERE modelId LIKE ? ORDER BY LENGTH(modelId) ASC LIMIT 1'
    );
    for (const c of pricingCandidates(model)) {
      if (c.split('-').length < 3) continue;
      found = like.get(c + '%');
      if (found) break;
    }
  }
  pricingCache.set(model, found || null);
  return found || null;
}

function calcCostMicroUsd(entry, pricing) {
  if (!pricing) return 0;
  return Math.round(
    entry.inputTokens * pricing.inputPerM +
    entry.outputTokens * pricing.outputPerM +
    entry.cacheReadTokens * pricing.cacheReadPerM +
    entry.cacheCreationTokens * pricing.cacheCreationPerM
  );
}

// ========== 会话日志解析 ==========

function listLogFiles() {
  const files = [];
  const walk = (dir, app) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, app);
      else if (e.isFile() && e.name.endsWith('.jsonl')) files.push({ file: full, app });
    }
  };
  walk(CLAUDE_PROJECTS_DIR, 'claude');
  for (const dir of CODEX_SESSION_DIRS) walk(dir, 'codex');
  return files;
}

function parseLine(line, projectDir) {
  if (!line || line.length < 20 || line.indexOf('"assistant"') === -1) return null;
  let obj;
  try { obj = JSON.parse(line); } catch { return null; }
  if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) return null;
  const msg = obj.message;
  const model = String(msg.model || '');
  if (!model || model.startsWith('<')) return null; // 跳过 <synthetic> 占位
  const u = msg.usage;
  const entry = {
    requestId: 'session:' + (msg.id || obj.requestId || obj.uuid),
    sessionId: obj.sessionId || '',
    projectDir,
    appType: 'claude',
    model,
    inputTokens: Math.max(0, u.input_tokens | 0),
    outputTokens: Math.max(0, u.output_tokens | 0),
    cacheReadTokens: Math.max(0, u.cache_read_input_tokens | 0),
    cacheCreationTokens: Math.max(0, u.cache_creation_input_tokens | 0),
  };
  if (entry.inputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheCreationTokens <= 0) return null;
  const ts = Date.parse(obj.timestamp);
  entry.createdAt = Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
  return entry;
}

// Codex 会话文件名形如 rollout-2026-05-15T14-09-48-<uuid>.jsonl
function codexSessionId(filePath) {
  const m = path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
  return m ? m[1] : path.basename(filePath, '.jsonl');
}

/**
 * Codex 解析：token_count 事件携带会话累计值，相邻事件差分得到单次用量。
 * OpenAI 语义下 input_tokens 已包含 cached_input_tokens，入库前归一化为
 * "新增输入 = input - cached"，与 Claude 口径对齐。state（当前模型/工作目录/
 * 上一次累计值）随 usage_sync.stateJson 持久化，保证跨次增量扫描差分正确。
 */
function parseCodexLines(lines, state, sessionId) {
  const entries = [];
  for (const line of lines) {
    if (!line || line.length < 10) continue;
    // 廉价预筛：绝大多数行是对话内容，避免全量 JSON.parse（日志总量数 GB 级）
    if (line.indexOf('"turn_context"') === -1 && line.indexOf('"token_count"') === -1) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const p = obj.payload || {};
    if (obj.type === 'turn_context') {
      if (p.model) state.model = String(p.model);
      if (p.cwd) state.cwd = String(p.cwd);
      continue;
    }
    if (obj.type !== 'event_msg' || p.type !== 'token_count' || !p.info) continue;
    const tot = p.info.total_token_usage;
    if (!tot) continue;
    const prev = state.prevTotal || {};
    let dIn = Math.trunc(tot.input_tokens || 0) - Math.trunc(prev.input || 0);
    let dCache = Math.trunc(tot.cached_input_tokens || 0) - Math.trunc(prev.cached || 0);
    let dOut = Math.trunc(tot.output_tokens || 0) - Math.trunc(prev.output || 0);
    if (dIn < 0 || dCache < 0 || dOut < 0) {
      // 会话内计数被重置：当前累计值即本段增量
      dIn = Math.trunc(tot.input_tokens || 0);
      dCache = Math.trunc(tot.cached_input_tokens || 0);
      dOut = Math.trunc(tot.output_tokens || 0);
    }
    state.prevTotal = {
      input: Math.trunc(tot.input_tokens || 0),
      cached: Math.trunc(tot.cached_input_tokens || 0),
      output: Math.trunc(tot.output_tokens || 0),
    };
    if (dIn + dOut <= 0) continue;
    const ts = Date.parse(obj.timestamp);
    entries.push({
      requestId: `codex:${sessionId}:${obj.timestamp}:${tot.total_tokens || 0}`,
      sessionId,
      projectDir: state.cwd ? (state.cwd.split('/').filter(Boolean).pop() || '') : '',
      appType: 'codex',
      model: state.model || 'unknown',
      inputTokens: Math.max(0, dIn - dCache),
      outputTokens: Math.max(0, dOut),
      cacheReadTokens: Math.max(0, dCache),
      cacheCreationTokens: 0,
      createdAt: Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000),
    });
  }
  return entries;
}

const insertLog = () => db.prepare(`
  INSERT OR REPLACE INTO usage_logs
    (requestId, sessionId, projectDir, appType, model, pricingModel,
     inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costMicroUsd, createdAt)
  VALUES (@requestId, @sessionId, @projectDir, @appType, @model, @pricingModel,
     @inputTokens, @outputTokens, @cacheReadTokens, @cacheCreationTokens, @costMicroUsd, @createdAt)
`);

function syncFile(filePath, app) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return 0; }
  const syncRow = db.prepare('SELECT * FROM usage_sync WHERE filePath = ?').get(filePath);
  let offset = syncRow ? syncRow.lastSize : 0;
  if (syncRow && stat.size === syncRow.lastSize) return 0;
  let parseState = {};
  if (syncRow && syncRow.stateJson) {
    try { parseState = JSON.parse(syncRow.stateJson); } catch { parseState = {}; }
  }
  if (stat.size < offset) { offset = 0; parseState = {}; } // 文件被截断重写：从头重读（主键去重保证幂等）

  let text;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return 0; }

  // 只消费完整行；半行（写入中）留给下一轮
  const lastNL = text.lastIndexOf('\n');
  if (lastNL === -1) return 0;
  const complete = text.slice(0, lastNL + 1);
  const consumedBytes = Buffer.byteLength(complete, 'utf8');
  const lines = complete.split('\n').map(l => l.trim());

  let entries;
  if (app === 'codex') {
    entries = parseCodexLines(lines, parseState, codexSessionId(filePath));
  } else {
    const projectDir = path.relative(CLAUDE_PROJECTS_DIR, filePath).split(path.sep)[0] || '';
    entries = lines.map(l => parseLine(l, projectDir)).filter(Boolean);
  }
  for (const entry of entries) {
    const pricing = findPricing(entry.model);
    entry.pricingModel = pricing ? pricing.modelId : '';
    entry.costMicroUsd = calcCostMicroUsd(entry, pricing);
  }

  const insert = insertLog();
  const tx = db.transaction(() => {
    for (const e of entries) insert.run(e);
    db.prepare(`
      INSERT INTO usage_sync (filePath, lastSize, lastMtimeMs, lastSyncedAt, stateJson)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(filePath) DO UPDATE SET lastSize = excluded.lastSize,
        lastMtimeMs = excluded.lastMtimeMs, lastSyncedAt = excluded.lastSyncedAt,
        stateJson = excluded.stateJson
    `).run(filePath, offset + consumedBytes, Math.trunc(stat.mtimeMs),
           Math.floor(Date.now() / 1000), JSON.stringify(parseState));
  });
  tx();
  return entries.length;
}

/**
 * 扫描所有会话日志并入库。默认 15s 节流（查询接口顺带触发用）；force 跳过节流。
 */
function syncUsage(force = false) {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_THROTTLE_MS) return { throttled: true };
  lastSyncAt = now;
  ensurePricingSeed();
  pricingCache.clear();
  const files = listLogFiles();
  let upserted = 0;
  for (const f of files) upserted += syncFile(f.file, f.app);
  return { files: files.length, upserted };
}

// ========== 美元→人民币汇率 ==========
// 12 小时内存缓存；拉取失败时用最近一次成功值，从未成功则用离线兜底汇率
const RATE_FALLBACK_CNY = 7.10;
let rateCache = { rate: 0, at: 0, source: '' };

async function getUsdCnyRate() {
  const now = Date.now();
  if (rateCache.rate > 0 && now - rateCache.at < 12 * 3600 * 1000) return rateCache;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const rate = Number(data && data.rates && data.rates.CNY);
    if (rate > 0) {
      rateCache = { rate, at: now, source: 'open.er-api.com' };
      return rateCache;
    }
  } catch { /* 网络失败走兜底 */ }
  if (!(rateCache.rate > 0)) rateCache = { rate: RATE_FALLBACK_CNY, at: now, source: 'fallback' };
  return rateCache;
}

// ========== CC Switch 历史数据导入 ==========
// Claude 桌面端会快速清理已关闭会话的日志文件，早期用量只存在于 CC Switch 的
// 永久数据库里。其去重主键格式（session:<message.id>）与本表一致，INSERT OR
// IGNORE 即可无冲突合并；成本一律用本地定价表重算（其旧版不认识新模型，成本不可信）。
const CC_SWITCH_DB = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');

function importFromCcSwitch() {
  if (!fs.existsSync(CC_SWITCH_DB)) {
    throw new Error('未找到 CC Switch 数据库 (~/.cc-switch/cc-switch.db)');
  }
  const Database = require('better-sqlite3');
  const src = new Database(CC_SWITCH_DB, { readonly: true, fileMustExist: true });
  let rows;
  let srcPricing = [];
  try {
    rows = src.prepare(`
      SELECT request_id AS requestId,
             COALESCE(session_id, '') AS sessionId,
             model,
             COALESCE(input_tokens, 0) AS inputTokens,
             COALESCE(output_tokens, 0) AS outputTokens,
             COALESCE(cache_read_tokens, 0) AS cacheReadTokens,
             COALESCE(cache_creation_tokens, 0) AS cacheCreationTokens,
             created_at AS createdAt
      FROM proxy_request_logs
      WHERE app_type = 'claude'
        AND COALESCE(data_source, 'proxy') IN ('session_log', 'proxy')
        AND COALESCE(model, '') <> ''
    `).all();
    try {
      srcPricing = src.prepare(`
        SELECT model_id, display_name, input_cost_per_million, output_cost_per_million,
               cache_read_cost_per_million, cache_creation_cost_per_million
        FROM model_pricing
      `).all();
    } catch { /* 极老版本无定价表则跳过 */ }
  } finally {
    src.close();
  }

  ensurePricingSeed();

  // 搬运其完整定价表（148+ 模型，含 DeepSeek/Kimi/GPT 等），已有条目不覆盖
  let pricingImported = 0;
  if (srcPricing.length) {
    const insertPricing = db.prepare(`
      INSERT OR IGNORE INTO model_pricing
        (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const txPricing = db.transaction(() => {
      for (const p of srcPricing) {
        if (!p.model_id) continue;
        pricingImported += insertPricing.run(
          p.model_id, p.display_name || '',
          Number(p.input_cost_per_million) || 0, Number(p.output_cost_per_million) || 0,
          Number(p.cache_read_cost_per_million) || 0, Number(p.cache_creation_cost_per_million) || 0
        ).changes;
      }
    });
    txPricing();
  }
  pricingCache.clear();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO usage_logs
      (requestId, sessionId, projectDir, appType, model, pricingModel,
       inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costMicroUsd, createdAt)
    VALUES (@requestId, @sessionId, '', 'claude', @model, @pricingModel,
       @inputTokens, @outputTokens, @cacheReadTokens, @cacheCreationTokens, @costMicroUsd, @createdAt)
  `);
  let imported = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens <= 0) continue;
      const pricing = findPricing(r.model);
      r.pricingModel = pricing ? pricing.modelId : '';
      r.costMicroUsd = calcCostMicroUsd(r, pricing);
      imported += insert.run(r).changes;
    }
  });
  tx();
  // 新单价就位后重算全部历史成本（含此前导入时未匹配到价格的记录）
  repriceAll();
  return { scanned: rows.length, imported, pricingImported };
}

/** 单价变更后全量重算成本（数据量小，直接全表重算最稳） */
function repriceAll() {
  pricingCache.clear();
  const rows = db.prepare('SELECT requestId, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens FROM usage_logs').all();
  const update = db.prepare('UPDATE usage_logs SET pricingModel = ?, costMicroUsd = ? WHERE requestId = ?');
  const tx = db.transaction(() => {
    for (const r of rows) {
      const pricing = findPricing(r.model);
      update.run(pricing ? pricing.modelId : '', calcCostMicroUsd(r, pricing), r.requestId);
    }
  });
  tx();
  return { repriced: rows.length };
}

// ========== 聚合查询 ==========

function rangeFilter(start, end, app) {
  const cond = [];
  const params = [];
  if (start) { cond.push('createdAt >= ?'); params.push(Number(start)); }
  if (end) { cond.push('createdAt < ?'); params.push(Number(end)); }
  if (app) { cond.push('appType = ?'); params.push(String(app)); }
  return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', params };
}

function getSummary(start, end, app) {
  const { where, params } = rangeFilter(start, end, app);
  const row = db.prepare(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(inputTokens), 0) AS inputTokens,
           COALESCE(SUM(outputTokens), 0) AS outputTokens,
           COALESCE(SUM(cacheReadTokens), 0) AS cacheReadTokens,
           COALESCE(SUM(cacheCreationTokens), 0) AS cacheCreationTokens,
           COALESCE(SUM(costMicroUsd), 0) AS costMicroUsd
    FROM usage_logs ${where}
  `).get(...params);
  const totalInput = row.inputTokens + row.cacheReadTokens + row.cacheCreationTokens;
  row.totalTokens = totalInput + row.outputTokens;
  row.cacheHitRate = totalInput > 0 ? row.cacheReadTokens / totalInput : 0;
  row.costUsd = row.costMicroUsd / 1e6;
  // 缓存净节省：命中按全价输入计算省下的钱，减去缓存创建相对全价的溢价
  const saved = db.prepare(`
    SELECT COALESCE(SUM(cacheReadTokens * (p.inputPerM - p.cacheReadPerM)
                      - cacheCreationTokens * (p.cacheCreationPerM - p.inputPerM)), 0) AS s
    FROM usage_logs l JOIN model_pricing p ON p.modelId = l.pricingModel ${where}
  `).get(...params).s;
  row.cacheSavedUsd = Math.round(saved) / 1e6;
  return row;
}

// 项目维度聚合：Claude 的路径编码目录与 Codex 的目录名归并到同一展示名
function projectDisplayName(dir) {
  dir = String(dir || '');
  if (!dir) return '(未知)';
  if (dir.startsWith('-')) {
    const seg = dir.split('-').filter(Boolean);
    return seg.length ? seg[seg.length - 1] : '(未知)';
  }
  return dir;
}

function getProjectStats(start, end, app) {
  const { where, params } = rangeFilter(start, end, app);
  const rows = db.prepare(`
    SELECT projectDir, appType, COUNT(*) AS requests,
           SUM(inputTokens) AS inputTokens, SUM(outputTokens) AS outputTokens,
           SUM(cacheReadTokens) AS cacheReadTokens, SUM(cacheCreationTokens) AS cacheCreationTokens,
           SUM(costMicroUsd) AS costMicroUsd
    FROM usage_logs ${where} GROUP BY projectDir, appType
  `).all(...params);
  const map = new Map();
  for (const r of rows) {
    const name = projectDisplayName(r.projectDir);
    const agg = map.get(name) || {
      project: name, requests: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0, costMicroUsd: 0, apps: new Set(),
    };
    agg.requests += r.requests;
    agg.inputTokens += r.inputTokens;
    agg.outputTokens += r.outputTokens;
    agg.cacheReadTokens += r.cacheReadTokens;
    agg.cacheCreationTokens += r.cacheCreationTokens;
    agg.costMicroUsd += r.costMicroUsd;
    agg.apps.add(r.appType);
    map.set(name, agg);
  }
  return [...map.values()]
    .map(a => ({ ...a, apps: [...a.apps].sort() }))
    .sort((x, y) => y.costMicroUsd - x.costMicroUsd);
}

function getTopRequests(start, end, app, limit = 10) {
  const { where, params } = rangeFilter(start, end, app);
  const size = Math.min(Math.max(Number(limit) || 10, 1), 50);
  return db.prepare(`
    SELECT * FROM usage_logs ${where} ORDER BY costMicroUsd DESC LIMIT ?
  `).all(...params, size);
}


function fmtBucketKey(d, bucket) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (bucket === 'min10') return `${day} ${p(d.getHours())}:${p(Math.floor(d.getMinutes() / 10) * 10)}`;
  return bucket === 'hour' ? `${day} ${p(d.getHours())}:00` : day;
}

// 各粒度的 SQL 分桶表达式与补桶参数（min10 = 10 分钟粒度，分钟向下取整）
const TREND_BUCKETS = {
  min10: {
    sql: `strftime('%Y-%m-%d %H:', createdAt, 'unixepoch', 'localtime') || printf('%02d', (CAST(strftime('%M', createdAt, 'unixepoch', 'localtime') AS INTEGER) / 10) * 10)`,
    stepMs: 600000, max: 320,
  },
  hour: { sql: `strftime('%Y-%m-%d %H:00', createdAt, 'unixepoch', 'localtime')`, stepMs: 3600000, max: 800 },
  day: { sql: `strftime('%Y-%m-%d', createdAt, 'unixepoch', 'localtime')`, stepMs: 86400000, max: 400 },
};

function getTrends(start, end, bucket, app) {
  const cfg = TREND_BUCKETS[bucket] || TREND_BUCKETS.day;
  const { where, params } = rangeFilter(start, end, app);
  const rows = db.prepare(`
    SELECT ${cfg.sql} AS bucket,
           COUNT(*) AS requests,
           SUM(inputTokens) AS inputTokens,
           SUM(outputTokens) AS outputTokens,
           SUM(cacheReadTokens) AS cacheReadTokens,
           SUM(cacheCreationTokens) AS cacheCreationTokens,
           SUM(costMicroUsd) AS costMicroUsd
    FROM usage_logs ${where}
    GROUP BY bucket ORDER BY bucket ASC
  `).all(...params);

  // 补全空桶：完整时间轴（如"今天"为 0-24 点），无数据的桶填零
  let startTs = start ? Number(start) * 1000 : null;
  if (!startTs) {
    const minFilter = rangeFilter('', '', app);
    const min = db.prepare(`SELECT MIN(createdAt) AS m FROM usage_logs ${minFilter.where}`).get(...minFilter.params).m;
    if (!min) return [];
    startTs = min * 1000;
  }
  const endTs = end ? Number(end) * 1000 : Date.now();
  if ((endTs - startTs) / cfg.stepMs > cfg.max) startTs = endTs - cfg.max * cfg.stepMs; // 超长跨度从尾部截取
  const cursor = new Date(startTs);
  if (bucket === 'min10') cursor.setMinutes(Math.floor(cursor.getMinutes() / 10) * 10, 0, 0);
  else if (bucket === 'hour') cursor.setMinutes(0, 0, 0);
  else cursor.setHours(0, 0, 0, 0);

  const map = new Map(rows.map(r => [r.bucket, r]));
  const out = [];
  while (cursor.getTime() < endTs && out.length < cfg.max) {
    const key = fmtBucketKey(cursor, bucket);
    out.push(map.get(key) || {
      bucket: key, requests: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0, costMicroUsd: 0,
    });
    if (bucket === 'min10') cursor.setMinutes(cursor.getMinutes() + 10);
    else if (bucket === 'hour') cursor.setHours(cursor.getHours() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function getModelStats(start, end, app) {
  const { where, params } = rangeFilter(start, end, app);
  return db.prepare(`
    SELECT l.model,
           l.appType,
           COALESCE(NULLIF(l.pricingModel, ''), '') AS pricingModel,
           COALESCE(p.displayName, l.model) AS displayName,
           COUNT(*) AS requests,
           SUM(l.inputTokens) AS inputTokens,
           SUM(l.outputTokens) AS outputTokens,
           SUM(l.cacheReadTokens) AS cacheReadTokens,
           SUM(l.cacheCreationTokens) AS cacheCreationTokens,
           SUM(l.costMicroUsd) AS costMicroUsd
    FROM usage_logs l
    LEFT JOIN model_pricing p ON p.modelId = l.pricingModel
    ${where ? where.replace(/createdAt/g, 'l.createdAt').replace(/appType/g, 'l.appType') : ''}
    GROUP BY l.model, l.appType ORDER BY costMicroUsd DESC
  `).all(...params);
}

function getLogs({ start, end, model, app, page = 1, pageSize = 20 }) {
  const cond = [];
  const params = [];
  if (start) { cond.push('createdAt >= ?'); params.push(Number(start)); }
  if (end) { cond.push('createdAt < ?'); params.push(Number(end)); }
  if (model) { cond.push('model = ?'); params.push(model); }
  if (app) { cond.push('appType = ?'); params.push(String(app)); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM usage_logs ${where}`).get(...params).cnt;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const rows = db.prepare(`
    SELECT * FROM usage_logs ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?
  `).all(...params, size, offset);
  return { total, page: Number(page) || 1, pageSize: size, rows };
}

module.exports = {
  syncUsage,
  repriceAll,
  importFromCcSwitch,
  getUsdCnyRate,
  getSummary,
  getTrends,
  getModelStats,
  getProjectStats,
  getTopRequests,
  getLogs,
  ensurePricingSeed,
};
