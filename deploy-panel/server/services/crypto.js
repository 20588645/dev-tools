/**
 * AES-256-GCM 密码加密/解密工具
 * 用于服务器密码的安全存储
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const SECRET_FILE = path.join(__dirname, '../data/.secret');

/**
 * 获取或生成加密密钥
 * 首次使用时自动生成并持久化到 .secret 文件
 */
function getKey() {
  if (fs.existsSync(SECRET_FILE)) {
    return Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, key.toString('hex'), 'utf8');
  return key;
}

/**
 * 加密明文密码
 * @param {string} plaintext
 * @returns {{ iv: string, authTag: string, encrypted: string }}
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), authTag, encrypted };
}

/**
 * 解密密文
 * @param {{ iv: string, authTag: string, encrypted: string }} cipherObj
 * @returns {string}
 */
function decrypt(cipherObj) {
  const key = getKey();
  const iv = Buffer.from(cipherObj.iv, 'hex');
  const authTag = Buffer.from(cipherObj.authTag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(cipherObj.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
