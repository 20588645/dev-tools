/**
 * SQLite 数据库初始化与连接管理
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 测试沙箱用独立数据目录，绝不污染正式数据库
const IS_TEST = process.env.DEVTOOLS_TEST === '1' || process.argv.includes('--test');
const DB_PATH = path.join(__dirname, '..', IS_TEST ? 'data-test' : 'data', 'devtools.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 恢复暂存换库：备份恢复不能覆盖运行中的库，由 backup 服务把目标备份落为
// restore-pending.db，这里在开库前完成换库；当前库自动留存 pre-restore 副本兜底
const RESTORE_PENDING = path.join(dataDir, 'restore-pending.db');
if (fs.existsSync(RESTORE_PENDING)) {
  try {
    if (fs.existsSync(DB_PATH)) {
      const backupDir = path.join(dataDir, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const p = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
      fs.copyFileSync(DB_PATH, path.join(backupDir, `devtools-${ts}-pre-restore.db`));
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch { /* 不存在则跳过 */ }
    }
    fs.renameSync(RESTORE_PENDING, DB_PATH);
    console.log('[DB] 已应用暂存的备份恢复（原库留存为 pre-restore 副本）');
  } catch (e) {
    console.error('[DB] 应用备份恢复失败，继续使用原库:', e.message);
  }
}

const db = new Database(DB_PATH);

// 性能优化
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    path TEXT,
    type TEXT DEFAULT 'single',
    displayName TEXT DEFAULT '',
    defaultNodeVersion TEXT DEFAULT '',
    defaultServerIds TEXT DEFAULT '[]',
    runCommand TEXT DEFAULT '',
    runNodeVersion TEXT DEFAULT '',
    runModules TEXT DEFAULT '[]',
    runIncludeHome INTEGER DEFAULT 0,
    runHomeModuleName TEXT DEFAULT 'home',
    runAutoRestart INTEGER DEFAULT 0,
    sortOrder INTEGER DEFAULT 0,
    groupName TEXT DEFAULT '',
    groupCollapsed INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT DEFAULT 'root',
    authType TEXT DEFAULT 'password',
    password TEXT DEFAULT '',
    defaultRemotePath TEXT DEFAULT '/',
    deployPaths TEXT DEFAULT '[]',
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    projectName TEXT,
    type TEXT,
    status TEXT,
    modules TEXT DEFAULT '[]',
    serverName TEXT DEFAULT '',
    nodeVersion TEXT DEFAULT '',
    remotePath TEXT DEFAULT '',
    duration TEXT DEFAULT '',
    timestamp TEXT DEFAULT (datetime('now')),
    logs TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS run_history (
    id TEXT PRIMARY KEY,
    projectName TEXT,
    modules TEXT DEFAULT '[]',
    command TEXT DEFAULT '',
    nodeVersion TEXT DEFAULT '',
    status TEXT DEFAULT '',
    startedAt TEXT,
    stoppedAt TEXT,
    duration TEXT DEFAULT '',
    exitCode INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    remindAt TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    date TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    icon TEXT DEFAULT '⚡',
    hasParam INTEGER DEFAULT 0,
    paramName TEXT DEFAULT '',
    paramPlaceholder TEXT DEFAULT '',
    paramDefault TEXT DEFAULT '',
    sortOrder INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS report_config (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS projects_json (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notebook_notes (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    pinned INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    sortOrder INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS terminal_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    nodeVersion TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    sortOrder INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS editor_drafts (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    sortOrder INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    requestId TEXT PRIMARY KEY,
    sessionId TEXT DEFAULT '',
    projectDir TEXT DEFAULT '',
    appType TEXT DEFAULT 'claude',
    model TEXT NOT NULL,
    pricingModel TEXT DEFAULT '',
    inputTokens INTEGER DEFAULT 0,
    outputTokens INTEGER DEFAULT 0,
    cacheReadTokens INTEGER DEFAULT 0,
    cacheCreationTokens INTEGER DEFAULT 0,
    costMicroUsd INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usage_logs_createdAt ON usage_logs(createdAt);
  CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model);

  CREATE TABLE IF NOT EXISTS usage_sync (
    filePath TEXT PRIMARY KEY,
    lastSize INTEGER DEFAULT 0,
    lastMtimeMs INTEGER DEFAULT 0,
    lastSyncedAt INTEGER DEFAULT 0,
    stateJson TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS model_pricing (
    modelId TEXT PRIMARY KEY,
    displayName TEXT DEFAULT '',
    inputPerM REAL DEFAULT 0,
    outputPerM REAL DEFAULT 0,
    cacheReadPerM REAL DEFAULT 0,
    cacheCreationPerM REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );
`);

// 确保 sortOrder 列存在（兼容旧数据库）
try {
  db.prepare("SELECT sortOrder FROM notebook_notes LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE notebook_notes ADD COLUMN sortOrder INTEGER DEFAULT 0");
}

// 确保 remindAt 列存在
try {
  db.prepare("SELECT remindAt FROM todos LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE todos ADD COLUMN remindAt TEXT DEFAULT ''");
}

// 用量表多应用支持（兼容旧数据库：历史行默认归为 claude）
try {
  db.prepare("SELECT appType FROM usage_logs LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE usage_logs ADD COLUMN appType TEXT DEFAULT 'claude'");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_usage_logs_appType ON usage_logs(appType)");
try {
  db.prepare("SELECT stateJson FROM usage_sync LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE usage_sync ADD COLUMN stateJson TEXT DEFAULT ''");
}

// ========== 通用应用设置（key/value） ==========
const _getSettingStmt = db.prepare('SELECT value FROM app_settings WHERE key = ?');
const _setSettingStmt = db.prepare(
  'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

db.getSetting = function (key, defaultValue = null) {
  try {
    const row = _getSettingStmt.get(key);
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
};

db.setSetting = function (key, value) {
  _setSettingStmt.run(key, String(value));
};

// 服务器 SSH 连接超时（秒→毫秒）：默认 60s，钳制 5–300s；所有 SSH 连接点统一取用，
// 保证前端「测试连接/浏览」与后端 readyTimeout 一致可配
db.getConnTimeoutMs = function () {
  const raw = parseInt(db.getSetting('connTimeoutSec', '60'), 10);
  const sec = Number.isFinite(raw) ? Math.min(Math.max(raw, 5), 300) : 60;
  return sec * 1000;
};

module.exports = db;
