/**
 * 持久 SFTP 会话 API —— FileZilla 式「文件传输」页的连接基建（T0）
 *
 * 连接复用同一条 ssh2 通道，避免每次翻目录/传输都重新建连。
 * 远程文件操作（list/mkdir/rename/delete）与传输队列在后续批次（T1/T3）挂到同一会话上。
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const sftpSession = require('../services/sftpSession');

// 读服务器记录（含加密密码，供建连用，不脱敏；不经网络返回明文）
function readServers() {
  const rows = db.prepare('SELECT * FROM servers').all();
  return rows.map((r) => ({
    ...r,
    password: r.password ? JSON.parse(r.password) : null,
    port: Number(r.port),
  }));
}

// POST /api/sftp/connect { serverId } — 建立或复用持久会话
router.post('/connect', async (req, res) => {
  try {
    const { serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'serverId 必填' });
    const server = readServers().find((s) => s.id === serverId);
    if (!server) return res.status(404).json({ error: '服务器不存在' });

    const result = await sftpSession.connect(server);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sftp/disconnect { sessionId } — 主动断开会话
router.post('/disconnect', (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId 必填' });
    const ok = sftpSession.disconnect(sessionId);
    res.json({ ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sftp/sessions — 当前活跃会话列表（脱敏）
router.get('/sessions', (req, res) => {
  try {
    res.json({ sessions: sftpSession.list(), idleTimeoutMs: sftpSession.IDLE_TIMEOUT_MS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sftp/:sid/keepalive — 心跳探活 + 续期空闲计时
router.post('/:sid/keepalive', async (req, res) => {
  try {
    const result = await sftpSession.keepalive(req.params.sid);
    if (!result.ok) return res.status(410).json(result); // 410 Gone：会话已失效，前端据此重连
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
