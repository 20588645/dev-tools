/**
 * 传输队列引擎（文件传输页 T3）
 *
 * 一次 POST /transfer = 一个 task，含若干 item（{from,to}，目录会递归展开成文件单元）。
 * 文件单元以可配并发（默认 2，存 app_settings.transferConcurrency）逐个用 ssh2 的
 * fastPut/fastGet 传输，借 step 回调出**字节级进度**（按单元节流 250ms 经 WS 广播）。
 * 方向无关地复用同一套逻辑：upload=本地→远程，download=远程→本地。
 *
 * 取消（v1）：标记 cancelled，worker 在「开下一个文件单元前」检查并停止；正在传的单元会
 * 自然传完（不硬中断流，故无半截残件）。单文件硬中断 + 限速/续传留 v2。
 */
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const sftpSession = require('./sftpSession');
const db = require('./database');

const DEFAULT_CONCURRENCY = 2;
const PROGRESS_THROTTLE_MS = 250;

const tasks = new Map(); // taskId -> task

function getConcurrency() {
  const n = parseInt(db.getSetting('transferConcurrency', String(DEFAULT_CONCURRENCY)), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 8) : DEFAULT_CONCURRENCY;
}

function posixJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}
function baseName(p) {
  return p.replace(/\/+$/, '').split('/').pop();
}

// 方向相关的源/目标原语（源端读、目标端写）
function makeOps(direction, sftp) {
  const up = direction === 'upload';
  return {
    srcIsDir: (p) => (up
      ? Promise.resolve(fs.statSync(p).isDirectory())
      : remoteStat(sftp, p).then((a) => a.isDirectory())),
    srcList: (p) => (up
      ? Promise.resolve(fs.readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, isDir: d.isDirectory() })))
      : remoteReaddir(sftp, p)),
    srcJoin: (a, b) => (up ? path.join(a, b) : posixJoin(a, b)),
    dstJoin: (a, b) => (up ? posixJoin(a, b) : path.join(a, b)),
    dstExists: (p) => (up ? remoteExists(sftp, p) : Promise.resolve(fs.existsSync(p))),
    dstEnsureDir: (p) => (up ? ensureRemoteDir(sftp, p) : Promise.resolve(fs.mkdirSync(p, { recursive: true }))),
    dstDirname: (p) => (up ? p.replace(/\/[^/]+\/?$/, '') || '/' : path.dirname(p)),
  };
}

function remoteStat(sftp, p) {
  return new Promise((resolve, reject) => sftp.stat(p, (err, attrs) => (err ? reject(err) : resolve(attrs))));
}
function remoteExists(sftp, p) {
  return new Promise((resolve) => sftp.stat(p, (err) => resolve(!err)));
}
function remoteReaddir(sftp, p) {
  return new Promise((resolve, reject) => sftp.readdir(p, (err, list) => {
    if (err) return reject(err);
    resolve((list || []).map((it) => ({
      name: it.filename,
      isDir: it.attrs && typeof it.attrs.isDirectory === 'function' ? it.attrs.isDirectory() : (it.longname || '').startsWith('d'),
    })));
  }));
}
// 远程递归建目录（复用 deployer 同款思路）
async function ensureRemoteDir(sftp, dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let cur = '/';
  for (const part of parts) {
    cur = posixJoin(cur, part);
    await new Promise((resolve, reject) => {
      sftp.stat(cur, (err) => {
        if (!err) return resolve();
        sftp.mkdir(cur, (mkErr) => ((mkErr && mkErr.code !== 4) ? reject(mkErr) : resolve()));
      });
    });
  }
}

function emit(broadcast, task, ev) {
  if (typeof broadcast === 'function') {
    broadcast('transfer', { taskId: task.taskId, direction: task.direction, ...ev });
  }
}

/**
 * 入队一个传输任务，立即返回 taskId，后台异步执行 + WS 推进度。
 */
function enqueue({ broadcast, sessionId, direction, items, onConflict = 'overwrite' }) {
  const taskId = `xfer-${uuidv4().slice(0, 8)}`;
  const task = {
    taskId, sessionId, direction, onConflict,
    state: 'queued', cancelled: false,
    files: [], filesTotal: 0, filesDone: 0,
    bytesTotal: 0, bytesDone: 0,
    ensuredDirs: new Set(),
    createdAt: Date.now(),
  };
  tasks.set(taskId, task);
  run(task, items, broadcast).catch((e) => {
    task.state = 'failed';
    emit(broadcast, task, { phase: 'failed', error: e.message, filesDone: task.filesDone, filesTotal: task.filesTotal });
  });
  return taskId;
}

async function run(task, items, broadcast) {
  const session = sftpSession.get(task.sessionId);
  if (!session) {
    task.state = 'failed';
    return emit(broadcast, task, { phase: 'failed', error: '会话不存在或已回收' });
  }
  const sftp = session.sftp;
  const ops = makeOps(task.direction, sftp);
  task.state = 'transferring';
  emit(broadcast, task, { phase: 'started', filesDone: 0, filesTotal: 0 });

  // 1) 展开目录为文件单元
  for (const it of items) {
    if (task.cancelled) break;
    await expand(task, ops, it.from, it.to);
  }
  task.filesTotal = task.files.length;
  task.files.forEach((u, i) => { u.index = i; });

  // 2) 可配并发处理
  const concurrency = Math.max(1, Math.min(getConcurrency(), task.files.length || 1));
  let cursor = 0;
  const worker = async () => {
    while (!task.cancelled) {
      const i = cursor++;
      if (i >= task.files.length) return;
      await transferOne(task, ops, sftp, task.files[i], broadcast);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (task.cancelled) { task.state = 'cancelled'; emit(broadcast, task, { phase: 'cancelled', filesDone: task.filesDone, filesTotal: task.filesTotal }); }
  else if (task.files.some((f) => f.error)) { task.state = 'failed'; emit(broadcast, task, { phase: 'failed', error: '部分文件传输失败', filesDone: task.filesDone, filesTotal: task.filesTotal }); }
  else { task.state = 'done'; emit(broadcast, task, { phase: 'done', filesDone: task.filesDone, filesTotal: task.filesTotal }); }

  // 完成后保留任务 5 分钟供查询，再清理
  setTimeout(() => tasks.delete(task.taskId), 5 * 60 * 1000).unref?.();
}

// 把 from→to 展开成文件单元（目录递归，保持结构）
async function expand(task, ops, from, to) {
  if (task.cancelled) return;
  let isDir;
  try { isDir = await ops.srcIsDir(from); }
  catch (e) { task.files.push({ from, to, name: baseName(from), size: 0, transferred: 0, error: `源不可访问: ${e.message}` }); return; }

  if (!isDir) {
    task.files.push({ from, to, name: baseName(from), size: 0, transferred: 0, error: null });
    return;
  }
  // 目录：确保目标目录存在，再递归子项
  await ensureDestDir(task, ops, to);
  let entries = [];
  try { entries = await ops.srcList(from); } catch { /* 读不了的目录跳过 */ }
  for (const e of entries) {
    if (task.cancelled) return;
    await expand(task, ops, ops.srcJoin(from, e.name), ops.dstJoin(to, e.name));
  }
}

async function ensureDestDir(task, ops, dir) {
  if (task.ensuredDirs.has(dir)) return;
  await ops.dstEnsureDir(dir);
  task.ensuredDirs.add(dir);
}

async function transferOne(task, ops, sftp, unit, broadcast) {
  if (task.cancelled || unit.error) { if (unit.error) finalizeUnit(task, broadcast, unit); return; }

  // 确保目标父目录存在（顶层文件落在当前目录；展开的已建过，靠 ensuredDirs 去重）
  try { await ensureDestDir(task, ops, ops.dstDirname(unit.to)); }
  catch (e) { unit.error = `目标目录创建失败: ${e.message}`; return finalizeUnit(task, broadcast, unit); }

  // 冲突处理
  try {
    if (await ops.dstExists(unit.to)) {
      if (task.onConflict === 'skip') { unit.skipped = true; return finalizeUnit(task, broadcast, unit); }
      if (task.onConflict === 'rename') unit.to = await uniqueDst(ops, unit.to);
      // overwrite：直接覆盖
    }
  } catch { /* 探测冲突失败就当不存在，继续传 */ }

  await doTransfer(task, sftp, unit, broadcast);
}

// 目标已存在时生成不冲突的新名：name.ext → name(1).ext
async function uniqueDst(ops, to) {
  const dot = to.lastIndexOf('.');
  const slash = Math.max(to.lastIndexOf('/'), to.lastIndexOf('\\'));
  const hasExt = dot > slash;
  const stem = hasExt ? to.slice(0, dot) : to;
  const ext = hasExt ? to.slice(dot) : '';
  for (let i = 1; i < 1000; i++) {
    const cand = `${stem}(${i})${ext}`;
    if (!(await ops.dstExists(cand))) return cand;
  }
  return `${stem}(${Date.now()})${ext}`;
}

function doTransfer(task, sftp, unit, broadcast) {
  return new Promise((resolve) => {
    const up = task.direction === 'upload';
    const startTs = Date.now();
    const step = (transferred, chunk, total) => {
      unit.transferred = transferred; unit.size = total;
      const now = Date.now();
      if (now - (unit.lastEmit || 0) < PROGRESS_THROTTLE_MS && transferred < total) return;
      unit.lastEmit = now;
      const sec = (now - startTs) / 1000;
      const speed = sec > 0 ? transferred / sec : 0;
      const etaSec = speed > 0 ? Math.max(0, (total - transferred) / speed) : 0;
      emit(broadcast, task, {
        phase: 'progress', fileIndex: unit.index, name: unit.name,
        bytes: transferred, total, percent: total ? Math.round((transferred / total) * 100) : 0,
        speed: Math.round(speed), etaSec: Math.round(etaSec),
        filesDone: task.filesDone, filesTotal: task.filesTotal,
      });
    };
    const cb = (err) => {
      if (err) unit.error = err.message; else unit.done = true;
      finalizeUnit(task, broadcast, unit);
      resolve();
    };
    try {
      if (up) sftp.fastPut(unit.from, unit.to, { step }, cb);
      else sftp.fastGet(unit.from, unit.to, { step }, cb);
    } catch (e) { cb(e); }
  });
}

// 单元收尾：计数 + 推一条终态进度（确保 100%/失败/跳过都有事件）
function finalizeUnit(task, broadcast, unit) {
  task.filesDone++;
  emit(broadcast, task, {
    phase: unit.error ? 'file-failed' : (unit.skipped ? 'file-skipped' : 'file-done'),
    fileIndex: unit.index, name: unit.name,
    bytes: unit.transferred || unit.size || 0, total: unit.size || 0,
    percent: unit.error ? 0 : 100, speed: 0, etaSec: 0,
    filesDone: task.filesDone, filesTotal: task.filesTotal,
    error: unit.error || undefined,
  });
}

function cancel(taskId) {
  const task = tasks.get(taskId);
  if (!task) return false;
  if (task.state === 'done' || task.state === 'failed' || task.state === 'cancelled') return false;
  task.cancelled = true;
  return true;
}

function get(taskId) {
  const t = tasks.get(taskId);
  if (!t) return null;
  return {
    taskId: t.taskId, direction: t.direction, state: t.state,
    filesTotal: t.filesTotal, filesDone: t.filesDone,
    onConflict: t.onConflict, createdAt: t.createdAt,
    files: t.files.map((f) => ({ name: f.name, percent: f.size ? Math.round((f.transferred / f.size) * 100) : 0, error: f.error || undefined, skipped: !!f.skipped, done: !!f.done })),
  };
}

module.exports = { enqueue, cancel, get, getConcurrency };
