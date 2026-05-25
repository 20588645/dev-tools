/**
 * 快捷命令 CRUD + 执行 API
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { encrypt, decrypt } = require('../services/crypto');

const DATA_FILE = path.join(__dirname, '../data/commands.json');
const SUDO_PWD_FILE = path.join(__dirname, '../data/sudo-pwd.json');

function readCommands() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeCommands(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function genId() {
  return 'cmd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function readSudoPassword() {
  try {
    const data = JSON.parse(fs.readFileSync(SUDO_PWD_FILE, 'utf8'));
    if (data && data.encrypted) return decrypt(data);
    return '';
  } catch { return ''; }
}

function writeSudoPassword(plaintext) {
  if (!plaintext) {
    try { fs.unlinkSync(SUDO_PWD_FILE); } catch {}
    return;
  }
  const encrypted = encrypt(plaintext);
  fs.writeFileSync(SUDO_PWD_FILE, JSON.stringify(encrypted, null, 2), 'utf8');
}

// GET /api/commands — 列表
router.get('/', (req, res) => {
  res.json(readCommands());
});

// GET /api/commands/sudo-status — 查询是否已配置 sudo 密码
router.get('/sudo-status', (req, res) => {
  const pwd = readSudoPassword();
  res.json({ configured: !!pwd });
});

// POST /api/commands/sudo-password — 保存 sudo 密码
router.post('/sudo-password', (req, res) => {
  const { password } = req.body;
  writeSudoPassword(password || '');
  res.json({ success: true, configured: !!password });
});

// POST /api/commands — 新增
router.post('/', (req, res) => {
  const { name, command, icon = '⚡', hasParam = false, paramName = '', paramPlaceholder = '', paramDefault = '' } = req.body;
  if (!name || !command) return res.status(400).json({ error: '名称和命令不能为空' });

  const commands = readCommands();
  const cmd = {
    id: genId(),
    name: name.trim(),
    command: command.trim(),
    icon,
    hasParam,
    paramName: paramName.trim(),
    paramPlaceholder: paramPlaceholder.trim(),
    paramDefault: paramDefault.trim(),
  };
  commands.push(cmd);
  writeCommands(commands);
  res.json(cmd);
});

// PUT /api/commands/:id — 更新
router.put('/:id', (req, res) => {
  const commands = readCommands();
  const idx = commands.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '命令不存在' });

  const { name, command, icon, hasParam, paramName, paramPlaceholder, paramDefault } = req.body;
  if (name !== undefined) commands[idx].name = name.trim();
  if (command !== undefined) commands[idx].command = command.trim();
  if (icon !== undefined) commands[idx].icon = icon;
  if (hasParam !== undefined) commands[idx].hasParam = hasParam;
  if (paramName !== undefined) commands[idx].paramName = paramName.trim();
  if (paramPlaceholder !== undefined) commands[idx].paramPlaceholder = paramPlaceholder.trim();
  if (paramDefault !== undefined) commands[idx].paramDefault = paramDefault.trim();

  writeCommands(commands);
  res.json(commands[idx]);
});

// DELETE /api/commands/:id — 删除
router.delete('/:id', (req, res) => {
  const commands = readCommands();
  const idx = commands.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '命令不存在' });
  commands.splice(idx, 1);
  writeCommands(commands);
  res.json({ success: true });
});

// POST /api/commands/exec — 执行命令
router.post('/exec', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: '命令不能为空' });

  let finalCommand = command;

  // 如果命令包含 sudo，自动注入密码
  if (command.trim().startsWith('sudo ')) {
    const sudoPassword = readSudoPassword();
    if (sudoPassword) {
      // 用 echo password | sudo -S 方式自动输入密码
      const cmdWithoutSudo = command.trim().replace(/^sudo\s+/, '');
      finalCommand = `echo '${sudoPassword.replace(/'/g, "'\\''")}' | sudo -S ${cmdWithoutSudo}`;
    }
  }

  const timeout = 30000;
  exec(finalCommand, { timeout, shell: '/bin/zsh', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    // 过滤掉 sudo 的密码提示输出
    let output = (stdout || '') + (stderr || '');
    output = output.replace(/Password:/g, '').replace(/\[sudo\].*password.*:/gi, '').trim();

    if (error && error.killed) {
      return res.json({ success: false, output: output + '\n⚠️ 命令执行超时（30s）' });
    }
    if (error) {
      return res.json({ success: false, output: output || error.message });
    }
    res.json({ success: true, output: output || '✅ 执行成功（无输出）' });
  });
});

module.exports = router;
