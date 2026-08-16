/**
 * 用系统 Google Chrome（Apple Events 注入 JS）打开网关并代登。
 * SFTP / FileZilla 由用户在页面里手动点。一次性 token 只写 0600 临时文件。
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildInjectedScript } = require('./gateway-page-agent');

const SCRIPT_PATH = path.join(__dirname, 'gateway-chrome.jxa');
const DEFAULT_TIMEOUT_MS = 35_000;

function mapOsascriptError(raw) {
  const text = String(raw || '').trim();
  if (/JavaScript through AppleScript is turned off|AppleScript is turned off|不允许.*JavaScript|Apple 事件/i.test(text)) {
    return 'Chrome 不允许通过 Apple 事件执行 JavaScript。请先点一下 Chrome 窗口，然后看屏幕最顶部菜单栏（不是设置页）：「显示」→「开发者」→勾选「允许 Apple 事件中的 JavaScript」，然后重试。';
  }
  if (/不能生成类|-2710|Can't make class|Can’t make class/i.test(text)) {
    return '无法让 Chrome 打开新标签。请先手动打开 Google Chrome，确认窗口在前台后再点「重试代登」。';
  }
  if (/Application can't be found|Can’t find|Can't find|(-1728)|not authorized/i.test(text)) {
    return '未找到 Google Chrome。请安装系统版 Chrome 后再试。';
  }
  return text || 'Chrome 自动化失败';
}

function parseRunnerResult(stdout, stderr, status) {
  const raw = String(stdout || '').trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return { status: 'error', detail: mapOsascriptError(raw) };
    }
  }
  if (status !== 0) {
    return { status: 'error', detail: mapOsascriptError(stderr) };
  }
  return { status: 'error', detail: 'Chrome 自动化没有返回有效结果' };
}

function writePayloadFile(payload) {
  const filePath = path.join(
    os.tmpdir(),
    `devtools-gw-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`,
  );
  fs.writeFileSync(filePath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

function runChromeAutomation(input, deps = {}) {
  const platform = deps.platform || process.platform;
  const spawn = deps.spawnSync || spawnSync;
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (platform !== 'darwin') {
    return { status: 'error', detail: '网关代登目前只支持 macOS 上的 Google Chrome' };
  }
  if (process.env.DEVTOOLS_TEST === '1' && process.env.DEVTOOLS_GATEWAY_CHROME !== '1') {
    return { status: 'done', detail: '测试环境已跳过 Chrome 代登' };
  }

  const payload = {
    loginUrl: String(input.loginUrl || ''),
    agentScript: buildInjectedScript({
      username: input.username,
      password: input.password,
      deviceIp: input.deviceIp,
    }),
  };
  const filePath = writePayloadFile(payload);
  try {
    const result = spawn('osascript', ['-l', 'JavaScript', SCRIPT_PATH, filePath], {
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    if (result.error) {
      if (result.error.code === 'ETIMEDOUT') {
        return {
          status: 'timeout',
          detail: '已打开网关，但登录确认超时。请在 Chrome 里完成登录后点 SFTP。',
        };
      }
      return { status: 'error', detail: result.error.message };
    }
    return parseRunnerResult(result.stdout, result.stderr, result.status);
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* JXA 可能已经删过 */ }
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  mapOsascriptError,
  parseRunnerResult,
  runChromeAutomation,
};
