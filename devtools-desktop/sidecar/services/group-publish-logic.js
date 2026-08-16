/**
 * 分组发布方式：直连 SFTP（默认）或网关 FileZilla 交接。
 * 密码与服务器密码同一套 AES-GCM；本模块不碰明文，只做归一化与校验。
 */

const path = require('path');

const PUBLISH_MODES = new Set(['direct-sftp', 'gateway-filezilla']);
const PASSWORD_MASK = '******';

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDevice(row) {
  const item = row && typeof row === 'object' ? row : {};
  return {
    projectName: text(item.projectName),
    deviceIp: text(item.deviceIp),
  };
}

function parseDevices(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeDevice).filter((item) => item.projectName);
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeDevice).filter((item) => item.projectName) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeProfile(row = {}, groupName = '') {
  const name = text(row.groupName, groupName);
  const mode = PUBLISH_MODES.has(row.publishMode) ? row.publishMode : 'direct-sftp';
  return {
    groupName: name,
    publishMode: mode,
    gatewayUrl: text(row.gatewayUrl),
    gatewayUsername: text(row.gatewayUsername),
    devices: parseDevices(row.devicesJson ?? row.devices),
  };
}

function toPublicProfile(profile, hasPassword) {
  return {
    ...normalizeProfile(profile),
    passwordMasked: hasPassword ? PASSWORD_MASK : '',
  };
}

function deviceIpFor(profile, projectName) {
  const name = text(projectName);
  const match = (profile.devices || []).find((item) => item.projectName === name);
  return match ? match.deviceIp : '';
}

function isGatewayMode(profile) {
  return normalizeProfile(profile).publishMode === 'gateway-filezilla';
}

function distPathFor(project) {
  const root = text(project && project.path);
  const distDir = text(project && project.distDir, 'dist') || 'dist';
  if (!root) return '';
  return path.join(root, distDir);
}

function firstServerId(project) {
  const ids = Array.isArray(project && project.defaultServerIds) ? project.defaultServerIds : [];
  if (ids.length && text(ids[0])) return text(ids[0]);
  return text(project && project.defaultServerId);
}

function firstDeployPath(server) {
  const raw = server && server.deployPaths;
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  return list.map(text).find(Boolean) || '';
}

function remotePathFor(project, server) {
  const fromProject = text(project && project.remotePath);
  if (fromProject) return fromProject;
  const fromPaths = firstDeployPath(server);
  if (fromPaths) return fromPaths;
  return text(server && server.defaultRemotePath);
}

function shouldKeepStoredPassword(value) {
  const incoming = text(value);
  return !incoming || incoming === PASSWORD_MASK;
}

function assertGatewayReady(profile, projectName) {
  const normalized = normalizeProfile(profile);
  if (normalized.publishMode !== 'gateway-filezilla') {
    return '该分组仍是直连 SFTP，未启用网关交接';
  }
  if (!normalized.gatewayUrl) return '请先填写网关登录地址';
  if (!/^https?:\/\//i.test(normalized.gatewayUrl)) return '网关地址必须是 http 或 https 链接';
  if (!normalized.gatewayUsername) return '请先填写网关用户名';
  const ip = deviceIpFor(normalized, projectName);
  if (!ip) return `请先为项目「${projectName}」填写对应的设备 IP`;
  return '';
}

module.exports = {
  PASSWORD_MASK,
  normalizeProfile,
  toPublicProfile,
  deviceIpFor,
  isGatewayMode,
  distPathFor,
  firstServerId,
  remotePathFor,
  shouldKeepStoredPassword,
  assertGatewayReady,
};
