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

module.exports = db;
