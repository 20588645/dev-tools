/**
 * 快捷命令 CRUD + 执行 API (SQLite)
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { exec } = require('child_process');
const { encrypt, decrypt } = require('../services/crypto');
const fs = require('fs');
const path = require('path');

const SUDO_PWD_FILE = path.join(__dirname, '../data/sudo-pwd.json');

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

// GET /api/commands
router.get('/', (req, res) => {
  const commands = db.prepare('SELECT * FROM commands ORDER BY sortOrder ASC, rowid ASC').all();
  // 转换 hasParam 为 boolean
  res.json(commands.map(c => ({ ...c, hasParam: !!c.hasParam })));
});

// GET /api/commands/sudo-status
router.get('/sudo-status', (req, res) => {
  const pwd = readSudoPassword();
  res.json({ configured: !!pwd });
});

// POST /api/commands/sudo-password
router.post('/sudo-password', (req, res) => {
  const { password } = req.body;
  writeSudoPassword(password || '');
  res.json({ success: true, configured: !!password });
});

// POST /api/commands
router.post('/', (req, res) => {
  const { name, command, icon = '⚡', hasParam = false, paramName = '', paramPlaceholder = '', paramDefault = '' } = req.body;
  if (!name || !command) return res.status(400).json({ error: '名称和命令不能为空' });

  const id = genId();
  const maxOrder = db.prepare('SELECT MAX(sortOrder) as m FROM commands').get().m || 0;
  db.prepare('INSERT INTO commands (id, name, command, icon, hasParam, paramName, paramPlaceholder, paramDefault, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name.trim(), command.trim(), icon, hasParam ? 1 : 0, paramName.trim(), paramPlaceholder.trim(), paramDefault.trim(), maxOrder + 1);

  res.json({ id, name: name.trim(), command: command.trim(), icon, hasParam, paramName: paramName.trim(), paramPlaceholder: paramPlaceholder.trim(), paramDefault: paramDefault.trim() });
});

// PUT /api/commands/:id
router.put('/:id', (req, res) => {
  const cmd = db.prepare('SELECT * FROM commands WHERE id = ?').get(req.params.id);
  if (!cmd) return res.status(404).json({ error: '命令不存在' });

  const { name, command, icon, hasParam, paramName, paramPlaceholder, paramDefault } = req.body;
  db.prepare('UPDATE commands SET name = ?, command = ?, icon = ?, hasParam = ?, paramName = ?, paramPlaceholder = ?, paramDefault = ? WHERE id = ?')
    .run(
      name !== undefined ? name.trim() : cmd.name,
      command !== undefined ? command.trim() : cmd.command,
      icon !== undefined ? icon : cmd.icon,
      hasParam !== undefined ? (hasParam ? 1 : 0) : cmd.hasParam,
      paramName !== undefined ? paramName.trim() : cmd.paramName,
      paramPlaceholder !== undefined ? paramPlaceholder.trim() : cmd.paramPlaceholder,
      paramDefault !== undefined ? paramDefault.trim() : cmd.paramDefault,
      req.params.id
    );

  res.json({ ...cmd, name: name || cmd.name, command: command || cmd.command });
});

// DELETE /api/commands/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM commands WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '命令不存在' });
  res.json({ success: true });
});

// POST /api/commands/exec
router.post('/exec', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: '命令不能为空' });

  let finalCommand = command;

  if (command.trim().startsWith('sudo ')) {
    const sudoPassword = readSudoPassword();
    if (sudoPassword) {
      const cmdWithoutSudo = command.trim().replace(/^sudo\s+/, '');
      finalCommand = `echo '${sudoPassword.replace(/'/g, "'\\''")}' | sudo -S ${cmdWithoutSudo}`;
    }
  }

  const timeout = 30000;
  exec(finalCommand, { timeout, shell: '/bin/zsh', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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
