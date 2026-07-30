/**
 * 2FA 账号管理与 TOTP 生成
 */
const crypto = require('crypto');
const db = require('./database');
const { encrypt, decrypt } = require('./crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function genId() {
  return `twofa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseIntOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeSecretInput(rawSecret) {
  const raw = normalizeText(rawSecret);
  if (!raw) return { secret: '', issuer: '', accountName: '', algorithm: 'SHA1', period: 30, digits: 6 };

  if (raw.toLowerCase().startsWith('otpauth://')) {
    try {
      const url = new URL(raw);
      const secret = normalizeText(url.searchParams.get('secret'));
      const algorithm = normalizeText(url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      const period = parseIntOr(url.searchParams.get('period'), 30);
      const digits = parseIntOr(url.searchParams.get('digits'), 6);
      const issuerParam = normalizeText(url.searchParams.get('issuer'));
      const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      let issuer = issuerParam;
      let accountName = label;
      if (label.includes(':')) {
        // label 形如 "Issuer:account"，冒号前一段始终是 issuer 前缀：
        // 无论是否已有 issuer 参数都要剥掉，否则账号名会带上 "Issuer:" 前缀
        const parts = label.split(':');
        const labelIssuer = parts.shift().trim();
        if (!issuer) issuer = labelIssuer;
        accountName = parts.join(':').trim();
      }
      return { secret, issuer, accountName, algorithm, period, digits };
    } catch {
      return { secret: raw, issuer: '', accountName: '', algorithm: 'SHA1', period: 30, digits: 6 };
    }
  }

  return { secret: raw, issuer: '', accountName: '', algorithm: 'SHA1', period: 30, digits: 6 };
}

function decodeBase32(input) {
  const clean = normalizeText(input).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function maskSecret(secret) {
  const clean = normalizeText(secret).replace(/\s+/g, '');
  if (!clean) return '—';
  if (clean.length <= 8) return `${clean.slice(0, 2)}••${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

function encryptSecret(secret) {
  return JSON.stringify(encrypt(secret));
}

function decryptSecret(cipherText) {
  if (!cipherText) return '';
  try {
    const payload = typeof cipherText === 'string' ? JSON.parse(cipherText) : cipherText;
    return decrypt(payload);
  } catch {
    return '';
  }
}

function normalizeAlgorithm(value) {
  const v = String(value || 'SHA1').toUpperCase();
  return ['SHA1', 'SHA256', 'SHA512'].includes(v) ? v : 'SHA1';
}

function normalizeDigits(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 6 && n <= 8 ? n : 6;
}

function normalizePeriod(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 15 ? n : 30;
}

function buildSecretObject(input = {}, existing = {}) {
  const parsed = normalizeSecretInput(input.secret || input.secretText || input.otpauth || '');
  const incomingSecret = normalizeText(input.secret ?? '');
  const parsedSecret = normalizeText(parsed.secret ?? '');
  const existingSecret = normalizeText(existing.secret ?? '');
  const secret = incomingSecret || parsedSecret || existingSecret;
  const issuer = normalizeText(input.issuer ?? parsed.issuer ?? existing.issuer ?? '');
  const accountName = normalizeText(input.accountName ?? input.account ?? parsed.accountName ?? existing.accountName ?? '');
  return {
    issuer,
    accountName,
    tag: normalizeText(input.tag ?? existing.tag ?? ''),
    groupName: normalizeText(input.groupName ?? input.group ?? existing.groupName ?? '其他') || '其他',
    algorithm: normalizeAlgorithm(input.algorithm ?? parsed.algorithm ?? existing.algorithm),
    period: normalizePeriod(input.period ?? parsed.period ?? existing.period),
    digits: normalizeDigits(input.digits ?? parsed.digits ?? existing.digits),
    secret
  };
}

function hotp(secretBytes, counter, algorithm = 'SHA1', digits = 6) {
  const algo = normalizeAlgorithm(algorithm).toLowerCase();
  const buf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac(algo, secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function generateTotp(secret, options = {}) {
  const algorithm = normalizeAlgorithm(options.algorithm);
  const digits = normalizeDigits(options.digits);
  const period = normalizePeriod(options.period);
  const epoch = parseIntOr(options.epoch, 0);
  const time = Math.floor((Number(options.timestamp) || Date.now()) / 1000);
  const counter = Math.floor((time - epoch) / period);
  const secretBytes = decodeBase32(secret);
  if (!secretBytes.length) {
    return {
      code: '------',
      remainingSeconds: period,
      expiresAt: (Math.floor(time / period) + 1) * period * 1000,
    };
  }
  const code = hotp(secretBytes, counter, algorithm, digits);
  const nextStep = (Math.floor(time / period) + 1) * period;
  const remainingSeconds = Math.max(1, nextStep - time);
  return {
    code,
    remainingSeconds,
    expiresAt: nextStep * 1000,
  };
}

function summarizeRow(row, withCode = true) {
  const secret = decryptSecret(row.secretCipherJson);
  const codeInfo = withCode ? generateTotp(secret, { algorithm: row.algorithm, period: row.period, digits: row.digits }) : null;
  return {
    id: row.id,
    issuer: row.issuer,
    accountName: row.accountName,
    tag: row.tag || '',
    groupName: row.groupName || '其他',
    algorithm: row.algorithm || 'SHA1',
    period: row.period || 30,
    digits: row.digits || 6,
    favorite: !!row.favorite,
    lastUsedAt: row.lastUsedAt || 0,
    sortOrder: row.sortOrder || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    secretMasked: maskSecret(secret),
    secretTail: secret ? secret.slice(-4) : '',
    currentCode: codeInfo ? codeInfo.code : '',
    remainingSeconds: codeInfo ? codeInfo.remainingSeconds : null,
    expiresAt: codeInfo ? codeInfo.expiresAt : null,
  };
}

function buildWhere(query = {}) {
  const clauses = [];
  const params = [];
  const q = normalizeText(query.q || query.search || '');
  const group = normalizeText(query.group || '');
  if (q) {
    clauses.push('(issuer LIKE ? OR accountName LIKE ? OR tag LIKE ? OR groupName LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (group) {
    clauses.push('groupName = ?');
    params.push(group);
  }
  if (query.favorite === '1' || query.favorite === 'true') {
    clauses.push('favorite = 1');
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function getAccounts(query = {}, withCode = true) {
  const filter = buildWhere(query);
  const rows = db.prepare(`
    SELECT *
    FROM twofa_accounts
    ${filter.where}
    ORDER BY favorite DESC, lastUsedAt DESC, sortOrder ASC, updatedAt DESC, createdAt DESC
  `).all(...filter.params);
  return rows.map(row => summarizeRow(row, withCode));
}

function getAccountRow(id) {
  return db.prepare('SELECT * FROM twofa_accounts WHERE id = ?').get(id) || null;
}

function readPublicAccounts(query = {}) {
  const accounts = getAccounts(query, true);
  const groups = new Map();
  for (const item of accounts) {
    groups.set(item.groupName, (groups.get(item.groupName) || 0) + 1);
  }
  return {
    accounts,
    stats: {
      total: accounts.length,
      favorites: accounts.filter(a => a.favorite).length,
      groups: Object.fromEntries(groups.entries()),
    }
  };
}

function saveAccount(input = {}, existing = null) {
  const normalized = buildSecretObject(input, existing ? { ...existing, secret: decryptSecret(existing.secretCipherJson) } : {});
  if (!normalized.issuer || !normalized.accountName || !normalized.secret) {
    throw new Error('平台、账号名和密钥不能为空');
  }
  const now = nowSec();
  const id = existing?.id || normalizeText(input.id) || genId();
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : (existing?.sortOrder ?? 0);
  const favorite = input.favorite !== undefined ? (input.favorite ? 1 : 0) : (existing?.favorite ? 1 : 0);
  db.prepare(`
    INSERT INTO twofa_accounts
      (id, issuer, accountName, tag, groupName, secretCipherJson, algorithm, period, digits, favorite, lastUsedAt, sortOrder, createdAt, updatedAt)
    VALUES
      (@id, @issuer, @accountName, @tag, @groupName, @secretCipherJson, @algorithm, @period, @digits, @favorite, @lastUsedAt, @sortOrder, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      issuer = excluded.issuer,
      accountName = excluded.accountName,
      tag = excluded.tag,
      groupName = excluded.groupName,
      secretCipherJson = excluded.secretCipherJson,
      algorithm = excluded.algorithm,
      period = excluded.period,
      digits = excluded.digits,
      favorite = excluded.favorite,
      sortOrder = excluded.sortOrder,
      updatedAt = excluded.updatedAt
  `).run({
    id,
    issuer: normalized.issuer,
    accountName: normalized.accountName,
    tag: normalized.tag,
    groupName: normalized.groupName,
    secretCipherJson: encryptSecret(normalized.secret),
    algorithm: normalized.algorithm,
    period: normalized.period,
    digits: normalized.digits,
    favorite,
    lastUsedAt: existing?.lastUsedAt || 0,
    sortOrder,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  return summarizeRow(getAccountRow(id), true);
}

function deleteAccount(id) {
  const result = db.prepare('DELETE FROM twofa_accounts WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('账号不存在');
  return { success: true };
}

function touchAccount(id) {
  const now = nowSec();
  const result = db.prepare('UPDATE twofa_accounts SET lastUsedAt = ?, updatedAt = ? WHERE id = ?').run(now, now, id);
  if (result.changes === 0) throw new Error('账号不存在');
  return { success: true, lastUsedAt: now };
}

// 已移除 exportAccounts：导出功能按需求下线，且该函数会解出明文密钥，
// 留着只是无用的暴露面。导入仍保留，用于从其他工具迁入。

function importAccounts(items = []) {
  const list = Array.isArray(items) ? items : [];
  let created = 0;
  let updated = 0;
  for (const item of list) {
    const id = normalizeText(item.id);
    const existing = id ? getAccountRow(id) : null;
    saveAccount(item, existing);
    if (existing) updated += 1;
    else created += 1;
  }
  return { created, updated, total: list.length, accounts: getAccounts({}, true) };
}

module.exports = {
  genId,
  normalizeSecretInput,
  generateTotp,
  summarizeRow,
  readPublicAccounts,
  getAccountRow,
  saveAccount,
  deleteAccount,
  touchAccount,
  importAccounts,
  decryptSecret,
};
