/**
 * Cursor 官方用量（与 TokenStep 同一口径）。
 *
 * Claude / Codex 扫本机 jsonl；Cursor 本机没有同类 token 账本。
 * 这里读取本机已登录的 Cursor accessToken，请求官方 usage events，
 * 再按请求入库。数字是当前登录账号（及所在 Team）的总量，不是「这台电脑」。
 *
 * 不把 accessToken 写入日志或错误信息。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const LOOKBACK_DAYS = 30;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 8000;
const FETCH_DEADLINE_MS = 20_000;
const EVENTS_URL = 'https://cursor.com/api/dashboard/get-filtered-usage-events';
const EVENTS_FALLBACK_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetFilteredUsageEvents';
const APPLICATION_USER_KEY =
  'src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser';

function cursorStateDbPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }
  return 0;
}

/** 官方接口常把数字做成字符串；ISO 时间戳则走 Date.parse。 */
function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTimestamp(value) {
  const numeric = asFiniteNumber(value);
  if (numeric != null) {
    const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return Math.floor(ms);
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value.trim());
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function userIdFromJwt(token) {
  const raw = String(token || '');
  const parts = raw.split('.');
  if (parts.length < 2) return '';
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return String(payload.sub || '').trim();
  } catch {
    return '';
  }
}

function queryCopiedDatabase(dbPath, sql) {
  const tmp = path.join(os.tmpdir(), `devtools-cursor-state-${process.pid}-${Date.now()}.vscdb`);
  fs.copyFileSync(dbPath, tmp);
  try {
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, tmp + suffix);
    }
    const Database = require('better-sqlite3');
    const db = new Database(tmp, { readonly: true, fileMustExist: true });
    try {
      return db.prepare(sql).get() || null;
    } finally {
      db.close();
    }
  } finally {
    for (const file of [tmp, `${tmp}-wal`, `${tmp}-shm`]) {
      try { fs.unlinkSync(file); } catch { /* 临时副本 */ }
    }
  }
}

function queryItemTable(dbPath, sql) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1500 });
    try {
      return db.prepare(sql).get() || null;
    } finally {
      db.close();
    }
  } catch {
    try {
      return queryCopiedDatabase(dbPath, sql);
    } catch {
      try {
        const out = execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
          encoding: 'utf8',
          timeout: 4000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const rows = JSON.parse(out || '[]');
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch {
        return null;
      }
    }
  }
}

function readCursorAuth(dbPath = cursorStateDbPath()) {
  if (!fs.existsSync(dbPath)) {
    throw new Error('未登录 Cursor');
  }
  const tokenRow = queryItemTable(dbPath, "select value from ItemTable where key='cursorAuth/accessToken' limit 1");
  const accessToken = String(tokenRow && tokenRow.value || '').trim();
  if (!accessToken) throw new Error('未登录 Cursor');
  const userId = userIdFromJwt(accessToken);
  if (!userId) throw new Error('未登录 Cursor');

  let dashboardUserId = 0;
  const userRow = queryItemTable(
    dbPath,
    `select json_extract(value, '$.dashboardUserId') as dashboardUserId from ItemTable where key='${APPLICATION_USER_KEY}' limit 1`,
  );
  if (userRow && userRow.dashboardUserId != null) dashboardUserId = toInt(userRow.dashboardUserId);

  return { accessToken, userId, dashboardUserId };
}

function dateWindow(now = new Date(), lookbackDays = LOOKBACK_DAYS) {
  const end = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (lookbackDays - 1)).getTime();
  return { start, end };
}

function parseEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const timestamp = parseTimestamp(raw.timestamp);
  if (!timestamp) return null;
  const usage = raw.tokenUsage && typeof raw.tokenUsage === 'object' ? raw.tokenUsage : raw;
  const model = String(raw.model || usage.model || 'unknown').trim() || 'unknown';
  const inputTokens = toInt(usage.inputTokens ?? usage.input_tokens);
  const outputTokens = toInt(usage.outputTokens ?? usage.output_tokens);
  const cacheReadTokens = toInt(usage.cacheReadTokens ?? usage.cache_read_tokens);
  const cacheCreationTokens = toInt(usage.cacheWriteTokens ?? usage.cache_write_tokens ?? usage.cacheCreationTokens);
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens <= 0) return null;
  const chargedCents = Number(raw.chargedCents ?? usage.totalCents ?? usage.total_cents);
  const eventId = String(raw.id || raw.eventId || raw.usageEventId || raw.requestId || '').trim();
  const requestId = eventId
    ? `cursor:${eventId}`
    : `cursor:${timestamp}:${model}:${inputTokens}:${outputTokens}:${cacheReadTokens}:${cacheCreationTokens}`;
  return {
    requestId,
    sessionId: String(raw.kind || raw.type || '').trim(),
    projectDir: '官方账号',
    appType: 'cursor',
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    chargedCents: Number.isFinite(chargedCents) ? chargedCents : 0,
    createdAt: Math.floor(timestamp / 1000),
  };
}

function rawEventsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const raw = payload.usageEventsDisplay || payload.usageEvents || [];
  return Array.isArray(raw) ? raw : [];
}

function eventsFromPayload(payload) {
  return rawEventsFromPayload(payload).map(parseEvent).filter(Boolean);
}

function totalUsageEventsCount(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const n = toInt(payload.totalUsageEventsCount);
  return n > 0 ? n : null;
}

async function postJson(url, { userId, accessToken, body, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://cursor.com',
        Cookie: `WorkosCursorSessionToken=${userId}::${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Cursor 登录已过期');
    }
    if (!res.ok) {
      throw new Error(`Cursor 用量接口 ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function postEventsPage(auth, start, end, page, fetchImpl) {
  const body = {
    startDate: String(start),
    endDate: String(end),
    page,
    pageSize: PAGE_SIZE,
  };
  if (auth.dashboardUserId > 0) body.userId = auth.dashboardUserId;
  try {
    return await postJson(EVENTS_URL, { ...auth, body, fetchImpl });
  } catch {
    return await postJson(EVENTS_FALLBACK_URL, { ...auth, body, fetchImpl });
  }
}

async function fetchOfficialEvents(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法请求 Cursor 用量接口');
  }
  const auth = options.auth || readCursorAuth(options.dbPath);
  const window = options.window || dateWindow(options.now);
  const collected = [];
  let total = Number.POSITIVE_INFINITY;
  let lastError = new Error('Cursor 用量暂不可用');
  const deadline = Date.now() + FETCH_DEADLINE_MS;

  for (let page = 1; page <= MAX_PAGES && collected.length < total; page += 1) {
    if (Date.now() > deadline) break;
    try {
      const payload = await postEventsPage(auth, window.start, window.end, page, fetchImpl);
      const pageEvents = eventsFromPayload(payload);
      if (page === 1 && !pageEvents.length && rawEventsFromPayload(payload).length) {
        throw new Error('Cursor 用量事件无法解析');
      }
      const reported = totalUsageEventsCount(payload);
      if (reported) total = reported;
      else if (!pageEvents.length) total = collected.length;
      collected.push(...pageEvents);
      if (!pageEvents.length) break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Cursor 用量暂不可用');
      if (!collected.length) throw lastError;
      break;
    }
  }

  if (!collected.length && !Number.isFinite(total)) throw lastError;
  return collected;
}

module.exports = {
  LOOKBACK_DAYS,
  cursorStateDbPath,
  userIdFromJwt,
  parseTimestamp,
  parseEvent,
  eventsFromPayload,
  dateWindow,
  readCursorAuth,
  fetchOfficialEvents,
};
