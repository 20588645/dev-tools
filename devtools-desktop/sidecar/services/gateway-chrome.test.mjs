// @vitest-environment node
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mapOsascriptError, parseRunnerResult, runChromeAutomation } = require('./gateway-chrome');

describe('gateway chrome runner', () => {
  it('translates Apple-events JS denial into a Chinese instruction', () => {
    expect(mapOsascriptError('Executing JavaScript through AppleScript is turned off.'))
      .toContain('允许 Apple 事件中的 JavaScript');
  });

  it('translates Chrome Tab class errors into a retry hint', () => {
    expect(mapOsascriptError('gateway-chrome.jxa: execution error: Error: Error: 不能生成类。 (-2710)'))
      .toContain('无法让 Chrome 打开新标签');
  });

  it('parses JXA JSON from stdout', () => {
    expect(parseRunnerResult('{"status":"done","detail":"ok"}', '', 0)).toEqual({
      status: 'done',
      detail: 'ok',
    });
  });

  it('refuses to run on non-macOS without spawning osascript', () => {
    const spawnSync = () => {
      throw new Error('should not spawn');
    };
    expect(runChromeAutomation(
      { loginUrl: 'https://example', username: 'u', password: 'p', deviceIp: '1.1.1.1' },
      { platform: 'linux', spawnSync },
    )).toMatchObject({
      status: 'error',
      detail: '网关代登目前只支持 macOS 上的 Google Chrome',
    });
  });
});
