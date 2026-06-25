/**
 * SFTP 部署引擎
 * 使用 ssh2 逐文件上传，支持 folder/root 两种上传策略
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('./crypto');
const db = require('./database');

/**
 * SFTP 部署
 * @param {Object} options
 * @param {Object} options.serverConfig - 服务器配置（含加密密码）
 * @param {string} options.localDistDir - 本地 dist 根目录
 * @param {string} options.remotePath - 远程根路径
 * @param {Array} options.modules - [{name, uploadStrategy}]
 * @param {Function} options.onLog - 日志回调
 * @param {Function} options.onProgress - 进度回调 (current, total)
 * @param {Object} [options.existingConn] - 预检阶段已建立的 SSH 连接（可选，复用以跳过重新建连）
 * @returns {Promise<{success: boolean, fileCount: number}>}
 */
function deploy({ serverConfig, localDistDir, remotePath, modules, onLog, onProgress, existingConn }) {
  return new Promise((resolve) => {
    let totalFiles = 0;
    let uploadedFiles = 0;

    // 统计待上传文件总数
    for (const mod of modules) {
      const localDir = mod.name ? path.join(localDistDir, mod.name) : localDistDir;
      if (fs.existsSync(localDir)) totalFiles += countFiles(localDir);
    }

    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    onLog('info', '📤 阶段三：上传部署');
    onLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    onLog('info', `🖥️  目标: ${serverConfig.host}:${serverConfig.port}`);
    onLog('info', `👤 用户: ${serverConfig.username}`);
    onLog('info', `📂 本地源: ${localDistDir}`);
    onLog('info', `📁 远程目标: ${remotePath}`);

    // 核心上传逻辑（复用 conn）
    const doUpload = (conn, shouldCloseConn) => {
      onLog('success', existingConn ? '✓ 复用预检连接' : '✓ SSH 连接已建立');
      conn.sftp((err, sftp) => {
        if (err) {
          onLog('error', `SFTP 会话建立失败: ${err.message}`);
          if (shouldCloseConn) conn.end();
          return resolve({ success: false, fileCount: 0 });
        }
        onLog('success', '✓ SFTP 通道已建立');
        onLog('info', `📦 共 ${totalFiles} 个文件待上传`);
        onLog('info', '');

        (async () => {
          try {
            for (const mod of modules) {
              const moduleName = mod.name || '(整体)';
              const localDir = mod.name ? path.join(localDistDir, mod.name) : localDistDir;

              if (!fs.existsSync(localDir)) {
                onLog('warn', `⚠ 模块 ${moduleName} 的产物目录不存在: ${localDir}`);
                continue;
              }

              let remoteDir;
              if (mod.uploadStrategy === 'root') {
                remoteDir = remotePath;
                onLog('info', `📂 ${moduleName} (root策略) → ${remoteDir}`);
              } else {
                remoteDir = posixJoin(remotePath, mod.name || '');
                onLog('info', `📂 ${moduleName} (folder策略) → ${remoteDir}`);
              }

              await uploadDirectory(sftp, localDir, remoteDir, (file) => {
                uploadedFiles++;
                onLog('info', `  ✓ ${file}`);
                onProgress(uploadedFiles, totalFiles);
              });

              onLog('success', `✓ 模块 [${moduleName}] 上传完成\n`);
            }

            onLog('success', `🎉 全部上传完成！共 ${uploadedFiles} 个文件`);
            if (shouldCloseConn) conn.end();
            resolve({ success: true, fileCount: uploadedFiles });
          } catch (err) {
            onLog('error', `上传过程出错: ${err.message}`);
            if (shouldCloseConn) conn.end();
            resolve({ success: false, fileCount: uploadedFiles });
          }
        })();
      });
    };

    // 如果有预检传入的已有连接，直接复用
    if (existingConn) {
      doUpload(existingConn, false);
      return;
    }

    // 否则新建连接（向后兼容仅构建等场景）
    const conn = new Client();
    onLog('cmd', `$ ssh ${serverConfig.username}@${serverConfig.host} -p ${serverConfig.port}`);

    conn.on('ready', () => doUpload(conn, true));

    conn.on('error', (err) => {
      onLog('error', `SSH 连接失败: ${err.message}`);
      resolve({ success: false, fileCount: 0 });
    });

    const connectConfig = {
      host: serverConfig.host,
      port: serverConfig.port,
      username: serverConfig.username,
      readyTimeout: db.getConnTimeoutMs(),
      tryKeyboard: true,
      authHandler: (() => {
        let attempts = 0;
        return (methodsLeft, partialSuccess, callback) => {
          if (methodsLeft === null) { attempts = 0; return callback('password'); }
          attempts++;
          if (attempts > 2) return callback(false);
          if (methodsLeft.includes('password')) return callback('password');
          if (methodsLeft.includes('keyboard-interactive')) return callback('keyboard-interactive');
          callback(false);
        };
      })(),
    };

    let decryptedPwd = '';
    if (serverConfig.authType === 'password' && serverConfig.password) {
      decryptedPwd = decrypt(serverConfig.password);
      connectConfig.password = decryptedPwd;
    }

    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      onLog('info', '  keyboard-interactive 认证...');
      finish([decryptedPwd]);
    });

    conn.connect(connectConfig);
  });
}

/**
 * 递归上传目录
 */
async function uploadDirectory(sftp, localDir, remoteDir, onFile) {
  await ensureRemoteDir(sftp, remoteDir);
  const items = fs.readdirSync(localDir);

  for (const item of items) {
    const localPath = path.join(localDir, item);
    const remotePath = posixJoin(remoteDir, item);

    if (fs.statSync(localPath).isDirectory()) {
      await uploadDirectory(sftp, localPath, remotePath, onFile);
    } else {
      await uploadFile(sftp, localPath, remotePath);
      onFile(remotePath);
    }
  }
}

/**
 * 上传单个文件（覆盖同名文件）
 */
function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(new Error(`上传失败 ${remotePath}: ${err.message}`));
      else resolve();
    });
  });
}

/**
 * 确保远程目录存在（递归创建）
 */
async function ensureRemoteDir(sftp, dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '/';

  for (const part of parts) {
    current = posixJoin(current, part);
    try {
      await new Promise((resolve, reject) => {
        sftp.stat(current, (err) => {
          if (err) {
            sftp.mkdir(current, (mkdirErr) => {
              if (mkdirErr && mkdirErr.code !== 4) reject(mkdirErr);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      });
    } catch (err) {
      // code 4 = 目录已存在，忽略
      if (err.code !== 4) throw err;
    }
  }
}

/**
 * 统计目录下文件总数
 */
function countFiles(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      count += countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * POSIX 风格路径拼接（远程服务器为 Linux）
 */
function posixJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

module.exports = { deploy };
