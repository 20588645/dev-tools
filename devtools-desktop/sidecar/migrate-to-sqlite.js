/**
 * 一次性迁移脚本：将现有 JSON 数据导入 SQLite
 * 运行: node migrate-to-sqlite.js
 */
const fs = require('fs');
const path = require('path');
const db = require('./services/database');

const DATA_DIR = path.join(__dirname, 'data');

function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

console.log('开始迁移 JSON → SQLite ...\n');

// 1. Projects
const projects = readJSON('projects.json');
if (projects.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM projects_json').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO projects_json (name, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => { for (const p of items) stmt.run(p.name, JSON.stringify(p)); });
    insertMany(projects);
    console.log(`✅ projects: ${projects.length} 条`);
  } else {
    console.log(`⏭  projects: 已有 ${existing} 条，跳过`);
  }
}

// 2. Servers
const servers = readJSON('servers.json');
if (servers.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM servers').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO servers (id, name, host, port, username, authType, password, defaultRemotePath, deployPaths) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const s of items) {
        stmt.run(s.id, s.name, s.host, s.port || 22, s.username || 'root', s.authType || 'password', s.password ? JSON.stringify(s.password) : '', s.defaultRemotePath || '/', JSON.stringify(s.deployPaths || []));
      }
    });
    insertMany(servers);
    console.log(`✅ servers: ${servers.length} 条`);
  } else {
    console.log(`⏭  servers: 已有 ${existing} 条，跳过`);
  }
}

// 3. History
const history = readJSON('history.json');
if (history.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM history').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO history (id, projectName, type, status, modules, serverName, nodeVersion, remotePath, duration, timestamp, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const h of items) {
        stmt.run(h.id || '', h.projectName || '', h.type || '', h.status || '', JSON.stringify(h.modules || []), h.serverName || '', h.nodeVersion || '', h.remotePath || '', h.duration || '', h.timestamp || '', typeof h.logs === 'string' ? h.logs : '');
      }
    });
    insertMany(history);
    console.log(`✅ history: ${history.length} 条`);
  } else {
    console.log(`⏭  history: 已有 ${existing} 条，跳过`);
  }
}

// 4. Run History
const runHistory = readJSON('run-history.json');
if (runHistory.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM run_history').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO run_history (id, projectName, modules, command, nodeVersion, status, startedAt, stoppedAt, duration, exitCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.projectName, JSON.stringify(r.moduleNames || r.modules || []), r.command || '', r.nodeVersion || '', r.status || '', r.startedAt || '', r.stoppedAt || '', r.duration || '', r.exitCode || 0);
      }
    });
    insertMany(runHistory);
    console.log(`✅ run_history: ${runHistory.length} 条`);
  } else {
    console.log(`⏭  run_history: 已有 ${existing} 条，跳过`);
  }
}

// 5. Todos
const todos = readJSON('todos.json');
if (todos.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM todos').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO todos (id, title, content, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const t of items) stmt.run(t.id, t.title, t.content || '', t.status, t.createdAt, t.updatedAt);
    });
    insertMany(todos);
    console.log(`✅ todos: ${todos.length} 条`);
  } else {
    console.log(`⏭  todos: 已有 ${existing} 条，跳过`);
  }
}

// 6. Notes
const notes = readJSON('notes.json');
if (notes.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO notes (date, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const n of items) stmt.run(n.date, n.title || '', n.content || '', n.createdAt || '', n.updatedAt || '');
    });
    insertMany(notes);
    console.log(`✅ notes: ${notes.length} 条`);
  } else {
    console.log(`⏭  notes: 已有 ${existing} 条，跳过`);
  }
}

// 7. Commands
const commands = readJSON('commands.json');
if (commands.length > 0) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM commands').get().c;
  if (existing === 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO commands (id, name, command, icon, hasParam, paramName, paramPlaceholder, paramDefault, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (let i = 0; i < items.length; i++) {
        const c = items[i];
        stmt.run(c.id, c.name, c.command, c.icon || '⚡', c.hasParam ? 1 : 0, c.paramName || '', c.paramPlaceholder || '', c.paramDefault || '', i);
      }
    });
    insertMany(commands);
    console.log(`✅ commands: ${commands.length} 条`);
  } else {
    console.log(`⏭  commands: 已有 ${existing} 条，跳过`);
  }
}

// 8. Report Config
const reportConfig = readJSON('report-config.json');
if (reportConfig && reportConfig.token) {
  const existing = db.prepare("SELECT COUNT(*) as c FROM report_config WHERE key = 'config'").get().c;
  if (existing === 0) {
    db.prepare("INSERT INTO report_config (key, value) VALUES ('config', ?)").run(JSON.stringify(reportConfig));
    console.log(`✅ report_config: 已导入`);
  } else {
    console.log(`⏭  report_config: 已存在，跳过`);
  }
}

console.log('\n✅ 迁移完成！数据库文件: data/devtools.db');
