/**
 * SQLite 数据库初始化与连接管理
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/devtools.db');

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
`);

module.exports = db;
