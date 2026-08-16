import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tickDocuments, buildInjectedScript } = require('./gateway-page-agent');

function freshState() {
  return {
    phase: 'start',
    loginClicks: 0,
    loginFormTicks: 0,
    loginFilled: 0,
    postLoginTicks: 0,
  };
}

function loginReadyState(overrides = {}) {
  return { ...freshState(), loginFormTicks: 1, loginFilled: 1, ...overrides };
}

describe('gateway page agent', () => {
  it('fills login form and does not treat 立即登录 as the login button', () => {
    document.body.innerHTML = `
      <input id="user" name="username" />
      <input id="pass" type="password" />
      <button type="button">立即登录</button>
      <button type="button" id="login">登录</button>
    `;
    const clicks = [];
    document.getElementById('login').addEventListener('click', () => clicks.push('login'));
    document.querySelector('button').addEventListener('click', () => clicks.push('now'));

    const state = loginReadyState();
    const result = tickDocuments([document], state, {
      username: 'ops',
      password: 'secret',
      deviceIp: '10.10.108.2',
    });

    expect(result).toMatchObject({ status: 'pending', detail: '已提交网关登录' });
    expect(document.getElementById('user').value).toBe('ops');
    expect(document.getElementById('pass').value).toBe('secret');
    expect(clicks).toEqual(['login']);
    expect(state.loginClicks).toBe(1);
  });

  it('waits one tick before filling the login form', () => {
    document.body.innerHTML = `
      <input id="user" name="username" />
      <input id="pass" type="password" />
      <button type="button" id="login">登录</button>
    `;
    const clicks = [];
    document.getElementById('login').addEventListener('click', () => clicks.push('login'));

    expect(tickDocuments([document], freshState(), {
      username: 'ops',
      password: 'secret',
      deviceIp: '10.10.108.2',
    }).detail).toBe('等待登录页加载完成');
    expect(clicks).toEqual([]);
  });

  it('ignores the basic-control version banner and still submits login', () => {
    document.body.innerHTML = `
      <div>本地控件版本不匹配, 请下载安装 基础控件</div>
      <input id="user" name="username" />
      <input id="pass" type="password" />
      <button type="button" id="login">登录</button>
    `;
    const clicks = [];
    document.getElementById('login').addEventListener('click', () => clicks.push('login'));

    const result = tickDocuments([document], loginReadyState(), {
      username: 'ops',
      password: 'secret',
      deviceIp: '10.10.108.2',
    });

    expect(result.detail).toBe('已提交网关登录');
    expect(clicks).toEqual(['login']);
  });

  it('stops after login instead of clicking SFTP', () => {
    document.body.innerHTML = `
      <table>
        <tr><td>10.10.100.2</td><td><button id="b">SFTP</button></td></tr>
      </table>
    `;
    const clicks = [];
    document.getElementById('b').addEventListener('click', () => clicks.push('b'));

    const result = tickDocuments([document], freshState(), { deviceIp: '10.10.100.2' });
    expect(result).toMatchObject({
      status: 'done',
      detail: '网关已打开。请在 Chrome 里点对应设备的 SFTP 调起 FileZilla。',
    });
    expect(clicks).toEqual([]);
  });

  it('hands off if the login form is still visible after submit', () => {
    document.body.innerHTML = `
      <input id="pass" type="password" />
      <button type="button" id="login">登录</button>
    `;
    const state = loginReadyState({ loginClicks: 1, postLoginTicks: 1 });
    const result = tickDocuments([document], state, {
      username: 'ops',
      password: 'secret',
      deviceIp: '10.10.108.2',
    });
    expect(result.status).toBe('done');
    expect(result.detail).toContain('已提交登录');
  });

  it('inlines credentials as JSON so quotes in the password stay escaped', () => {
    const script = buildInjectedScript({ username: 'ops', password: 'a"b\\c', deviceIp: '10.0.0.1' });
    expect(script).toContain('"password":"a\\"b\\\\c"');
    expect(script).toContain('createAgentApi');
    expect(script).toContain('loginFormTicks:0');
  });
});
