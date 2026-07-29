const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const CURRENT_IS_TEST = process.env.DEVTOOLS_TEST === '1' || process.argv.includes('--test');

// 查找所有「测试沙箱」sidecar 进程 PID。
// 测试服务允许使用 `--test` 或 `DEVTOOLS_TEST=1` 两种启动契约；正式 Sidecar
// 没有这两个标记，因此即使路径相同也不会被列出或停止。
function findTestSidecarPids(options = {}) {
  const includeCurrent = options.includeCurrent === true;
  let pids = [];
  try {
    const out = execSync('pgrep -f "sidecar/index.js"', { encoding: 'utf8' });
    pids = out.split(/\s+/).map(Number).filter(p => p && (includeCurrent || p !== process.pid));
  } catch {
    return []; // pgrep 无匹配会以非 0 退出
  }
  // 只保留真正的 node 进程，并要求命令参数或进程环境携带明确测试标记。
  const matched = pids.filter(pid => {
    try {
      const command = execSync(`ps eww -o command= -p ${pid}`, { encoding: 'utf8' });
      const executable = command.trim().split(/\s+/, 1)[0];
      const isNode = executable === 'node' || executable.endsWith('/node');
      return isNode
        && command.includes('sidecar/index.js')
        && (
          command.includes('sidecar/index.js --test')
          || /(?:^|\s)DEVTOOLS_TEST=1(?:\s|$)/.test(command)
        )
    } catch {
      return false;
    }
  });
  if (includeCurrent && CURRENT_IS_TEST && !matched.includes(process.pid)) matched.push(process.pid);
  return matched;
}

// GET /api/system/test-sidecars — 列出测试沙箱进程
router.get('/test-sidecars', (req, res) => {
  res.json({ pids: findTestSidecarPids({ includeCurrent: true }) });
});

// POST /api/system/test-sidecars/kill — 停止所有测试沙箱进程
router.post('/test-sidecars/kill', (req, res) => {
  const pids = findTestSidecarPids({ includeCurrent: true });
  const otherPids = pids.filter(pid => pid !== process.pid);
  const shouldStopCurrent = pids.includes(process.pid);
  for (const pid of otherPids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  // 先响应调用方，再停止当前测试 Sidecar；正式 Sidecar 永远不会进入 pids。
  res.json({ killed: pids.length });
  setTimeout(() => {
    for (const pid of otherPids) {
      try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
    }
    if (shouldStopCurrent) {
      try { process.kill(process.pid, 'SIGTERM'); } catch {}
    }
  }, 300);
});

module.exports = router;
