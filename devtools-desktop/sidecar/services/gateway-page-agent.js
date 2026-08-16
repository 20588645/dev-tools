/**
 * 网关运维页代点逻辑。createAgentApi 必须自包含：它会被 toString 后注入系统 Chrome。
 */

function createAgentApi() {
  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.hidden) return false;
    const style = el.style || {};
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  function textOf(el) {
    if (!el) return '';
    return normalize(el.innerText || el.textContent || el.value || el.getAttribute && el.getAttribute('aria-label') || '');
  }

  function clickableNodes(root, preferredOnly) {
    if (!root || !root.querySelectorAll) return [];
    const selector = preferredOnly
      ? 'a, button, input[type=button], input[type=submit], [role=button]'
      : 'a, button, span, div, td, li, label, input[type=button], input[type=submit], [role=button], [onclick]';
    return Array.from(root.querySelectorAll(selector)).filter(isVisible);
  }

  function findClickable(root, labels, options) {
    const wanted = labels.map(normalize).filter(Boolean);
    const batches = [clickableNodes(root, true), clickableNodes(root, false)];
    for (let b = 0; b < batches.length; b += 1) {
      const nodes = batches[b];
      for (let i = 0; i < nodes.length; i += 1) {
        const text = textOf(nodes[i]);
        if (wanted.some((label) => text === label)) return nodes[i];
      }
      if (options && options.fuzzy) {
        for (let i = 0; i < nodes.length; i += 1) {
          const text = textOf(nodes[i]);
          if (text.length > 32) continue;
          const lower = text.toLowerCase();
          if (wanted.some((label) => lower.includes(label.toLowerCase()))) return nodes[i];
        }
      }
    }
    return null;
  }

  function findInDocs(docs, labels, options) {
    for (let i = 0; i < docs.length; i += 1) {
      const found = findClickable(docs[i], labels, options);
      if (found) return found;
    }
    return null;
  }

  function queryFirst(docs, selector) {
    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      if (!doc || !doc.querySelectorAll) continue;
      const nodes = Array.from(doc.querySelectorAll(selector)).filter(isVisible);
      if (nodes[0]) return nodes[0];
    }
    return null;
  }

  function fill(el, value) {
    if (!el) return;
    const doc = el.ownerDocument;
    const win = doc && doc.defaultView;
    try { el.focus && el.focus(); } catch { /* ignore */ }

    const text = String(value == null ? '' : value);
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? (win && win.HTMLTextAreaElement)
        : (win && win.HTMLInputElement);
      const desc = proto && Object.getOwnPropertyDescriptor(proto.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, text);
      else el.value = text;
    } catch {
      el.value = text;
    }

    const EventCtor = win && win.Event;
    const InputEventCtor = win && win.InputEvent;
    ['keydown', 'input', 'keyup', 'change'].forEach((type) => {
      let event = null;
      try {
        if (type === 'input' && InputEventCtor) {
          event = new InputEventCtor('input', { bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste' });
        } else if (EventCtor) {
          event = new EventCtor(type, { bubbles: true, cancelable: true });
        }
      } catch {
        event = null;
      }
      if (!event && doc && doc.createEvent) {
        event = doc.createEvent('Event');
        event.initEvent(type, true, true);
      }
      if (event) el.dispatchEvent(event);
    });
  }

  function click(el) {
    if (!el) return;
    const doc = el.ownerDocument;
    const win = doc && doc.defaultView;
    try {
      el.focus && el.focus();
    } catch {
      // 有的节点不能 focus
    }
    try {
      if (win && win.MouseEvent) {
        el.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: win }));
        el.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, cancelable: true, view: win }));
        el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
        return;
      }
    } catch {
      // 退回原生 click
    }
    if (typeof el.click === 'function') el.click();
  }

  function findPassword(docs) {
    return queryFirst(docs, 'input[type=password]');
  }

  function findUsername(docs) {
    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      if (!doc || !doc.querySelectorAll) continue;
      const inputs = Array.from(doc.querySelectorAll('input')).filter((el) => {
        const type = String(el.type || 'text').toLowerCase();
        return isVisible(el) && (type === 'text' || type === 'tel' || type === 'email' || type === 'search' || type === '');
      });
      const named = inputs.find((el) => /user|account|login|name|帐|账|户/i.test(
        `${el.name || ''} ${el.id || ''} ${el.placeholder || ''}`,
      ));
      if (named) return named;
      if (inputs[0]) return inputs[0];
    }
    return null;
  }

  function collectDocuments(doc) {
    const list = [doc];
    if (!doc || !doc.querySelectorAll) return list;
    const frames = doc.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i += 1) {
      try {
        if (frames[i].contentDocument) list.push(frames[i].contentDocument);
      } catch {
        // 跨域 iframe 读不到，跳过
      }
    }
    return list;
  }

  function loggedInResult() {
    return {
      status: 'done',
      detail: '网关已打开。请在 Chrome 里点对应设备的 SFTP 调起 FileZilla。',
    };
  }

  function tick(docs, state, config) {
    const password = findPassword(docs);
    if (!password) return loggedInResult();

    if (state.loginClicks >= 1) {
      state.postLoginTicks = (state.postLoginTicks || 0) + 1;
      if (state.postLoginTicks >= 2) {
        return {
          status: 'done',
          detail: '已提交登录。若仍停在登录页，请在 Chrome 里完成验证码后继续。',
        };
      }
      return { status: 'pending', detail: '正在等待登录结果' };
    }

    state.loginFormTicks = (state.loginFormTicks || 0) + 1;
    if (state.loginFormTicks < 2) {
      return { status: 'pending', detail: '等待登录页加载完成' };
    }

    fill(findUsername(docs), config.username);
    fill(password, config.password);
    if (!state.loginFilled) {
      state.loginFilled = 1;
      return { status: 'pending', detail: '已填入账号，等待登录页同步' };
    }

    const loginBtn = findInDocs(docs, ['登录', 'Login']);
    if (!loginBtn) return { status: 'error', detail: '找不到网关登录按钮' };
    click(loginBtn);
    state.loginClicks = 1;
    state.phase = 'logging-in';
    return { status: 'pending', detail: '已提交网关登录' };
  }

  return { collectDocuments, tick };
}

function buildInjectedScript(config) {
  const payload = {
    username: String(config.username || ''),
    password: String(config.password || ''),
    deviceIp: String(config.deviceIp || ''),
  };
  return `(function(){var config=${JSON.stringify(payload)};var api=(${createAgentApi.toString()})();var g=window.__devtoolsGw=window.__devtoolsGw||{phase:"start",loginClicks:0,loginFormTicks:0,loginFilled:0,postLoginTicks:0};try{var docs=api.collectDocuments(document);return JSON.stringify(api.tick(docs,g,config));}catch(e){return JSON.stringify({status:"error",detail:String(e&&e.message||e)});}})()`;
}

function tickDocuments(docs, state, config) {
  return createAgentApi().tick(docs, state, config);
}

module.exports = {
  createAgentApi,
  buildInjectedScript,
  tickDocuments,
};
