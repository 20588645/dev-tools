const { exec } = require('child_process');

/**
 * 递归获取某个 PID 的所有子 PID（包括子进程的子进程）
 * @param {number} parentPid
 * @returns {Promise<number[]>}
 */
function getChildPids(parentPid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // 仅作跨平台防呆，该工具聚焦 macOS
      return resolve([]);
    }
    exec(`pgrep -P ${parentPid}`, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const pids = stdout.split(/\s+/).map(Number).filter(Boolean);
      
      // 递归获取所有子进程的子进程
      const tasks = pids.map(pid => getChildPids(pid));
      Promise.all(tasks).then((nested) => {
        resolve([...pids, ...nested.flat()]);
      });
    });
  });
}

/**
 * 递归杀掉整个进程树（包含自身）
 * @param {number} pid - 要杀掉的根 PID
 * @param {string} signal - 传递给 kill 的信号（如 'SIGTERM', 'SIGKILL'）
 * @returns {Promise<void>}
 */
async function killProcessTree(pid, signal = 'SIGTERM') {
  if (!pid) return;
  
  try {
    const children = await getChildPids(pid);
    
    // 1. 先自底向上依次终结所有子进程（防叶子孤儿化）
    for (const childPid of children) {
      try {
        process.kill(childPid, signal);
      } catch (e) {
        // 忽略进程已不存在等错误
      }
    }
    
    // 2. 终结根进程自身
    try {
      process.kill(pid, signal);
    } catch (e) {
      // 忽略错误
    }
  } catch (err) {
    // 兜底处理
    try {
      process.kill(pid, signal);
    } catch (e) {}
  }
}

module.exports = {
  killProcessTree,
  getChildPids
};
