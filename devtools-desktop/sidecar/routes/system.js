const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// 查找所有「测试沙箱」sidecar 进程 PID（仅 node 进程，命令行含 sidecar/index.js 与 --test）
function findTestSidecarPids() {
  let pids = [];
  try {
    const out = execSync('pgrep -f "sidecar/index.js --test"', { encoding: 'utf8' });
    pids = out.split(/\s+/).map(Number).filter(p => p && p !== process.pid);
  } catch (e) {
    return []; // pgrep 无匹配会以非 0 退出
  }
  // 只保留真正的 node 进程，排除恰好包含该字符串的 shell 包装进程
  return pids.filter(pid => {
    try {
      const comm = execSync(`ps -o comm= -p ${pid}`, { encoding: 'utf8' }).trim();
      return comm.endsWith('node');
    } catch (e) {
      return false;
    }
  });
}

// GET /api/system/test-sidecars — 列出测试沙箱进程
router.get('/test-sidecars', (req, res) => {
  res.json({ pids: findTestSidecarPids() });
});

// POST /api/system/test-sidecars/kill — 停止所有测试沙箱进程
router.post('/test-sidecars/kill', (req, res) => {
  const pids = findTestSidecarPids();
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch (e) {} }
  // 稍等后强杀仍存活的
  setTimeout(() => {
    for (const pid of findTestSidecarPids()) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} }
    res.json({ killed: pids.length });
  }, 300);
});

module.exports = router;
