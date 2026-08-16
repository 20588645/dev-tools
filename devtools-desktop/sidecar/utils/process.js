const { exec, spawnSync } = require('child_process');

const SESSION_KILL_GRACE_MS = 1500;
const SESSION_KILL_IMMEDIATE_WAIT_MS = 700;

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function isSafePid(pid) {
  const n = Number(pid);
  return Number.isInteger(n) && n > 1 && n !== process.pid;
}

/**
 * 同步列出 pid 的全部子孙（不含自身）。关 PTY 时必须同步，避免 sidecar 退出后子进程成孤儿。
 */
function listDescendantPidsSync(parentPid) {
  if (!isSafePid(parentPid) || process.platform === 'win32') return [];
  const found = [];
  const stack = [Number(parentPid)];
  const seen = new Set(stack);
  while (stack.length) {
    const current = stack.pop();
    const result = spawnSync('pgrep', ['-P', String(current)], { encoding: 'utf8' });
    const kids = String(result.stdout || '').split(/\s+/).map(Number).filter(isSafePid);
    for (const kid of kids) {
      if (seen.has(kid)) continue;
      seen.add(kid);
      found.push(kid);
      stack.push(kid);
    }
  }
  return found;
}

function getChildPids(parentPid) {
  return new Promise((resolve) => {
    if (!isSafePid(parentPid) || process.platform === 'win32') {
      return resolve([]);
    }
    exec(`pgrep -P ${parentPid}`, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const pids = stdout.split(/\s+/).map(Number).filter(isSafePid);
      Promise.all(pids.map((pid) => getChildPids(pid))).then((nested) => {
        resolve([...pids, ...nested.flat()]);
      });
    });
  });
}

function signalPid(pid, signal) {
  if (!isSafePid(pid)) return;
  try { process.kill(pid, signal); } catch { /* 已退出 */ }
}

/**
 * 杀掉整棵进程树（含自身）。先打进程组，再自底向上打子孙，避免 npm/java 脱离 shell 后还活着。
 */
function killProcessTreeSync(pid, signal = 'SIGTERM') {
  if (!isSafePid(pid)) return;
  const children = listDescendantPidsSync(pid);
  try { process.kill(-Number(pid), signal); } catch { /* 不是组长则忽略 */ }
  for (let i = children.length - 1; i >= 0; i -= 1) {
    signalPid(children[i], signal);
  }
  signalPid(pid, signal);
}

async function killProcessTree(pid, signal = 'SIGTERM') {
  killProcessTreeSync(pid, signal);
}

/**
 * 关终端会话：先 SIGTERM 让 Vite/Spring 收尾，稍后 SIGKILL 清残留。
 * sidecar 即将退出时应传 immediate，只打 SIGKILL。
 */
function killSession(pid, options = {}) {
  if (!isSafePid(pid)) return;
  killProcessTreeSync(pid, 'SIGTERM');
  if (options.immediate) {
    // 给 shell 的 EXIT/TERM 陷阱一点时间去停 nohup 的隧道等脱离进程
    sleepSync(SESSION_KILL_IMMEDIATE_WAIT_MS);
    killProcessTreeSync(pid, 'SIGKILL');
    return;
  }
  setTimeout(() => {
    killProcessTreeSync(pid, 'SIGKILL');
  }, SESSION_KILL_GRACE_MS).unref();
}

module.exports = {
  SESSION_KILL_GRACE_MS,
  listDescendantPidsSync,
  getChildPids,
  killProcessTreeSync,
  killProcessTree,
  killSession,
};
