/**
 * 分组发布方式 CRUD + 网关 FileZilla 交接。
 * 密码只在 sidecar 解密，响应里只回掩码。
 */

const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { encrypt, decrypt } = require('../services/crypto');
const {
  normalizeProfile,
  toPublicProfile,
  distPathFor,
  firstServerId,
  remotePathFor,
  shouldKeepStoredPassword,
  assertGatewayReady,
} = require('../services/group-publish-logic');
const { runChromeAutomation } = require('../services/gateway-chrome');

function findProject(name) {
  const rows = db.prepare('SELECT data FROM projects_json').all();
  for (const row of rows) {
    try {
      const project = JSON.parse(row.data);
      if (project && project.name === name) return project;
    } catch {
      // 跳过坏行
    }
  }
  return null;
}

function readRow(groupName) {
  return db.prepare('SELECT * FROM group_publish_profiles WHERE groupName = ?').get(groupName) || null;
}

function publicOf(row, groupName) {
  if (!row) return toPublicProfile({ groupName }, false);
  return toPublicProfile(row, Boolean(row.gatewayPassword));
}

function decryptPassword(row) {
  if (!row || !row.gatewayPassword) return '';
  try {
    return decrypt(JSON.parse(row.gatewayPassword));
  } catch {
    return null;
  }
}

function upsertProfile(groupName, body, existing) {
  const normalized = normalizeProfile({ ...body, groupName }, groupName);
  if (!normalized.groupName) {
    const error = new Error('分组名不能为空');
    error.status = 400;
    throw error;
  }

  let passwordJson = existing ? existing.gatewayPassword : '';
  if (!shouldKeepStoredPassword(body && body.gatewayPassword)) {
    passwordJson = JSON.stringify(encrypt(String(body.gatewayPassword)));
  }

  db.prepare(`
    INSERT INTO group_publish_profiles
      (groupName, publishMode, gatewayUrl, gatewayUsername, gatewayPassword, devicesJson, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(groupName) DO UPDATE SET
      publishMode = excluded.publishMode,
      gatewayUrl = excluded.gatewayUrl,
      gatewayUsername = excluded.gatewayUsername,
      gatewayPassword = excluded.gatewayPassword,
      devicesJson = excluded.devicesJson,
      updatedAt = datetime('now')
  `).run(
    normalized.groupName,
    normalized.publishMode,
    normalized.gatewayUrl,
    normalized.gatewayUsername,
    passwordJson || '',
    JSON.stringify(normalized.devices),
  );

  return readRow(normalized.groupName);
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM group_publish_profiles').all();
  const map = {};
  for (const row of rows) {
    map[row.groupName] = publicOf(row, row.groupName);
  }
  res.json(map);
});

router.get('/:groupName', (req, res) => {
  const groupName = String(req.params.groupName || '').trim();
  res.json(publicOf(readRow(groupName), groupName));
});

router.put('/:groupName', (req, res) => {
  try {
    const groupName = String(req.params.groupName || '').trim();
    const row = upsertProfile(groupName, req.body || {}, readRow(groupName));
    res.json(publicOf(row, groupName));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.post('/:groupName/rename', (req, res) => {
  const from = String(req.params.groupName || '').trim();
  const to = String((req.body && req.body.to) || '').trim();
  if (!from || !to) return res.status(400).json({ error: '新旧分组名都不能为空' });
  if (from === to) return res.json(publicOf(readRow(from), from));

  const source = readRow(from);
  if (!source) return res.json(publicOf(null, to));

  const dest = readRow(to);
  if (dest) {
    db.prepare('DELETE FROM group_publish_profiles WHERE groupName = ?').run(from);
    return res.json(publicOf(dest, to));
  }

  db.prepare('UPDATE group_publish_profiles SET groupName = ?, updatedAt = datetime(\'now\') WHERE groupName = ?')
    .run(to, from);
  res.json(publicOf(readRow(to), to));
});

router.post('/:groupName/connect', async (req, res) => {
  const groupName = String(req.params.groupName || '').trim();
  const projectName = String((req.body && req.body.projectName) || '').trim();
  if (!projectName) return res.status(400).json({ error: '缺少项目名' });

  const project = findProject(projectName);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const distPath = distPathFor(project);
  const serverId = firstServerId(project);
  const server = serverId
    ? db.prepare('SELECT defaultRemotePath, deployPaths FROM servers WHERE id = ?').get(serverId)
    : null;
  const row = readRow(groupName);
  const profile = normalizeProfile(row || { groupName }, groupName);
  const remotePath = remotePathFor(project, server, profile);
  const readyError = assertGatewayReady(profile, projectName);
  if (readyError) return res.status(400).json({ error: readyError, distPath, remotePath });

  const password = decryptPassword(row);
  if (password === null) {
    return res.status(500).json({ error: '无法读取已保存的网关密码，请重新保存', distPath, remotePath });
  }
  if (!password) return res.status(400).json({ error: '请先保存网关密码', distPath, remotePath });

  try {
    const result = await Promise.resolve(runChromeAutomation({
      loginUrl: profile.gatewayUrl,
      username: profile.gatewayUsername,
      password,
    }));
    const ok = result.status === 'done' || result.status === 'timeout';
    const message = result.detail || (ok
      ? '网关已打开。请在 Chrome 里点 SFTP 调起 FileZilla，并把产物拖到远程路径。'
      : '网关代登失败');
    res.json({
      ok,
      distPath,
      remotePath,
      message,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '网关代登失败',
      distPath,
      remotePath,
    });
  }
});

module.exports = router;
