/**
 * 数据库备份服务
 * - 备份用 better-sqlite3 在线备份 API（WAL 模式下安全，不能用文件拷贝，会撕裂）
 * - 自动备份每日至多一次（启动后延迟触发 + 24h 周期），滚动保留最近 KEEP_COUNT 份
 * - 恢复采用"暂存 + 重启换库"：运行中的库不能被覆盖，恢复文件先落为
 *   restore-pending.db，database.js 在下次开库前完成换库（当前库自动留存 pre-restore 副本）
 */
const fs = require('fs');
const path = require('path');
const db = require('./database');

const IS_TEST = process.env.DEVTOOLS_TEST === '1' || process.argv.includes('--test');
const DATA_DIR = path.join(__dirname, '..', IS_TEST ? 'data-test' : 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RESTORE_PENDING = path.join(DATA_DIR, 'restore-pending.db');
const KEEP_COUNT = 7;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, size: st.size, createdAt: Math.floor(st.mtimeMs / 1000) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function prune() {
  for (const b of listBackups().slice(KEEP_COUNT)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.file)); } catch { /* 忽略 */ }
  }
}

async function createBackup(reason = 'manual') {
  ensureDir();
  const file = `devtools-${stamp()}-${reason}.db`;
  await db.backup(path.join(BACKUP_DIR, file));
  prune();
  return { file, size: fs.statSync(path.join(BACKUP_DIR, file)).size };
}

/** 自动备份：当天已有任意备份则跳过，避免频繁重启把保留窗口刷穿 */
async function autoBackup() {
  const newest = listBackups()[0];
  if (newest) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (newest.createdAt * 1000 >= todayStart.getTime()) return { skipped: true };
  }
  return createBackup('auto');
}

function stageRestore(file) {
  const src = path.join(BACKUP_DIR, path.basename(String(file))); // basename 防路径穿越
  if (!fs.existsSync(src)) throw new Error('备份文件不存在');
  const head = Buffer.alloc(16);
  const fd = fs.openSync(src, 'r');
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (!head.toString('utf8').startsWith('SQLite format 3')) throw new Error('不是有效的 SQLite 备份文件');
  fs.copyFileSync(src, RESTORE_PENDING);
  return { staged: true, file: path.basename(String(file)) };
}

function cancelRestore() {
  try { fs.unlinkSync(RESTORE_PENDING); } catch { /* 不存在即视为已取消 */ }
  return { canceled: true };
}

function hasPendingRestore() {
  return fs.existsSync(RESTORE_PENDING);
}

function deleteBackup(file) {
  const target = path.join(BACKUP_DIR, path.basename(String(file)));
  if (!fs.existsSync(target)) throw new Error('备份文件不存在');
  fs.unlinkSync(target);
  return { deleted: true };
}

module.exports = {
  listBackups,
  createBackup,
  autoBackup,
  stageRestore,
  cancelRestore,
  hasPendingRestore,
  deleteBackup,
};
