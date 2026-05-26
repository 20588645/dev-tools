// ========== Module: Settings (设置) ==========
let settingsLoaded = false;

async function loadSettings() {
  // 菜单排序每次都刷新
  renderMenuOrderSettings();

  if (settingsLoaded) return;
  settingsLoaded = true;

  // Sidecar 状态
  try {
    const health = await API.get('/api/health');
    const badge = document.getElementById('settingSidecarStatus');
    badge.textContent = `● 运行中 · PID ${health.pid} · 端口 ${API_BASE.split(':').pop()}`;
    badge.className = 'setting-badge online';
    document.getElementById('settingAbout').textContent = `v${APP_VERSION} · macOS · Sidecar PID ${health.pid}`;
  } catch (e) {
    const badge = document.getElementById('settingSidecarStatus');
    badge.textContent = '● 离线';
    badge.className = 'setting-badge offline';
  }

  // Node 版本
  try {
    const data = await API.get('/api/projects/node-versions/list');
    document.getElementById('settingNodeVersion').textContent = data.current || data.versions?.[0] || '-';
  } catch (e) { console.warn("[Settings] Node版本获取失败"); }

  // 扫描目录
  document.getElementById('settingScanDir').textContent = '/Users/ldy/project/';
  await updateNotificationSettingsUI();

  // GitLab 配置
  try {
    const cfg = await API.get('/api/report/config');
    document.getElementById('settingToken').value = cfg.token || '';
    document.getElementById('settingAuthor').value = cfg.author || '';
    renderSettingRepos(cfg.repos || []);
  } catch (e) { console.warn("[Settings] GitLab配置加载失败"); }

  // Live2D 看板娘开关同步
  const live2dCb = document.getElementById('settingLive2dEnabled');
  if (live2dCb) live2dCb.checked = isLive2dEnabled();

  // 点击粒子特效开关同步
  const clickEffectCb = document.getElementById('settingClickEffectEnabled');
  if (clickEffectCb) clickEffectCb.checked = isClickEffectEnabled();

  // 检查更新
  checkForUpgrade();
}

// ========== 应用更新 ==========
async function checkForUpgrade() {
  try {
    const data = await API.get('/api/upgrade/check');
    const item = document.getElementById('upgradeCheckItem');
    if (data.hasUpdate && item) {
      item.style.display = '';
      document.getElementById('upgradeCommits').textContent = data.commits.join('\n');
    }
  } catch (e) {}
}

let upgradePolling = null;

async function startUpgrade() {
  const ok = await showConfirm('确定要重新打包并更新应用吗？\n\n将执行：git pull → 打包 → 安装 → 重启\n过程中应用会自动关闭并重新打开。', { confirmText: '立即更新' });
  if (!ok) return;

  const btn = document.getElementById('btnUpgrade');
  const logEl = document.getElementById('upgradeLog');

  btn.disabled = true;
  btn.textContent = '更新中...';

  // 打开更新弹窗（不可关闭）
  document.getElementById('upgradeModal').classList.add('active');
  logEl.textContent = '正在启动更新流程...\n';
  document.getElementById('upgradeProgressFill').style.width = '5%';

  try {
    await API.post('/api/upgrade/start');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '立即更新';
    document.getElementById('upgradeModal').classList.remove('active');
    showAlert('启动更新失败: ' + e.message, { icon: '❌' });
    return;
  }

  // 轮询日志
  upgradePolling = setInterval(async () => {
    try {
      const data = await API.get('/api/upgrade/status');
      logEl.textContent = data.log || '等待中...';
      logEl.scrollTop = logEl.scrollHeight;

      // 根据日志内容更新进度条
      const log = data.log || '';
      if (log.includes('[5/5]')) {
        document.getElementById('upgradeProgressFill').style.width = '95%';
      } else if (log.includes('[4/5]')) {
        document.getElementById('upgradeProgressFill').style.width = '85%';
      } else if (log.includes('[3/5]')) {
        document.getElementById('upgradeProgressFill').style.width = '75%';
      } else if (log.includes('Finished') && log.includes('bundle')) {
        document.getElementById('upgradeProgressFill').style.width = '70%';
      } else if (log.includes('Compiling app')) {
        document.getElementById('upgradeProgressFill').style.width = '40%';
      } else if (log.includes('[2/5]')) {
        document.getElementById('upgradeProgressFill').style.width = '20%';
      } else if (log.includes('[1/5]')) {
        document.getElementById('upgradeProgressFill').style.width = '10%';
      }

      if (data.failed) {
        clearInterval(upgradePolling);
        document.getElementById('upgradeProgressFill').style.width = '100%';
        document.getElementById('upgradeProgressFill').style.background = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = '立即更新';
        // 失败时允许关闭弹窗
        setTimeout(() => {
          document.getElementById('upgradeModal').classList.remove('active');
          showAlert('打包失败，请查看日志', { icon: '❌' });
        }, 2000);
      } else if (data.completed) {
        clearInterval(upgradePolling);
        document.getElementById('upgradeProgressFill').style.width = '100%';
        logEl.textContent += '\n即将重启应用...\n';
      }
    } catch (e) {
      // Sidecar 已被杀掉，说明正在重启
      clearInterval(upgradePolling);
      document.getElementById('upgradeProgressFill').style.width = '100%';
      logEl.textContent += '\n应用正在重启...\n';
    }
  }, 2000);
}

async function updateNotificationSettingsUI() {
  const toggle = document.getElementById('settingNotificationEnabled');
  const status = document.getElementById('settingNotificationStatus');
  if (!toggle || !status) return;

  const enabled = areNotificationsEnabled();
  toggle.checked = enabled;

  if (!enabled) {
    status.textContent = '已关闭';
    status.className = 'setting-badge offline';
    return;
  }

  const granted = await isNotificationPermissionGranted();
  status.textContent = granted ? '已允许' : '未授权';
  status.className = granted ? 'setting-badge online' : 'setting-badge offline';
}

async function toggleNotificationEnabled(enabled) {
  setNotificationsEnabled(enabled);
  if (enabled) {
    const granted = await requestNotificationPermission({ force: true });
    if (!granted) {
      showToast('通知未授权', '请在系统设置中允许 DevTools 发送通知');
    }
  }
  await updateNotificationSettingsUI();
}

async function testDesktopNotification() {
  setNotificationsEnabled(true);
  const granted = await requestNotificationPermission({ force: true });
  await updateNotificationSettingsUI();
  if (!granted) {
    await showAlert('系统通知未授权，请在 macOS 系统设置中允许 DevTools 发送通知。', { icon: '🔔' });
    return;
  }
  await sendDesktopNotification('DevTools 通知已开启', '构建、部署任务完成后会通过系统通知提醒你。', true, { force: true });
  showToast('🔔 测试通知已发送');
}

function renderSettingRepos(repos) {
  const list = document.getElementById('settingRepoList');
  if (!repos || repos.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">暂无仓库，点击「+ 添加仓库」</div>';
    return;
  }
  list.innerHTML = repos.map((r, i) => `
    <div class="setting-repo-row" data-idx="${i}">
      <input type="text" class="repo-url" value="${(r.repo||'').replace(/"/g,'&quot;')}" placeholder="仓库地址 (http://...)">
      <input type="text" class="repo-branch" value="${(r.branch||'').replace(/"/g,'&quot;')}" placeholder="分支">
      <input type="text" class="repo-group" value="${(r.group||'').replace(/"/g,'&quot;')}" placeholder="分组">
      <button onclick="this.parentElement.remove()" title="删除">✕</button>
    </div>
  `).join('');
}

function settingsAddRepo() {
  const list = document.getElementById('settingRepoList');
  // 如果只有占位文字，清空
  if (list.querySelector('div:not(.setting-repo-row)')) list.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'setting-repo-row';
  div.innerHTML = `
    <input type="text" class="repo-url" value="" placeholder="仓库地址 (http://...)">
    <input type="text" class="repo-branch" value="" placeholder="分支">
    <input type="text" class="repo-group" value="" placeholder="分组">
    <button onclick="this.parentElement.remove()" title="删除">✕</button>
  `;
  list.appendChild(div);
}

async function saveAllSettings() {
  const token = document.getElementById('settingToken').value.trim();
  const author = document.getElementById('settingAuthor').value.trim();

  // 收集仓库列表
  const repos = [];
  document.querySelectorAll('#settingRepoList .setting-repo-row').forEach(row => {
    const url = row.querySelector('.repo-url').value.trim();
    const branch = row.querySelector('.repo-branch').value.trim();
    const group = row.querySelector('.repo-group').value.trim();
    if (url) repos.push({ repo: url, branch, group });
  });

  try {
    await API.post('/api/report/config', { token, author, outputDir: '', repos });
    // 同步更新周报模块的 repos
    rptRepos = repos.length ? repos.map(r => ({...r})) : [{ repo: '', branch: '', group: '' }];
    showToast('✅ 设置已保存');
  } catch (e) {
    showAlert('保存失败: ' + e.message, { icon: '❌' });
  }
}

// ========== Live2D 看板娘 ==========
const LIVE2D_ENABLED_KEY = 'devtools-live2d-enabled';

function isLive2dEnabled() {
  return localStorage.getItem(LIVE2D_ENABLED_KEY) === 'true';
}

function toggleLive2d(enabled) {
  localStorage.setItem(LIVE2D_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    loadLive2dWidget();
  } else {
    removeLive2dWidget();
  }
}

function loadLive2dWidget() {
  // 如果之前只是隐藏了，直接显示
  const waifu = document.getElementById('waifu');
  if (waifu) {
    waifu.style.display = '';
    return;
  }

  // 如果已经加载过脚本就不重复加载
  if (document.getElementById('live2d-widget-script')) return;

  const script = document.createElement('script');
  script.id = 'live2d-widget-script';
  script.src = 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.0/dist/autoload.js';
  script.onerror = () => {
    console.warn('Live2D 看板娘加载失败，请检查网络连接');
    showToast('⚠️ 看板娘加载失败', '请检查网络连接');
  };
  document.body.appendChild(script);
}

function removeLive2dWidget() {
  // 只隐藏不移除，方便重新开启
  const waifu = document.getElementById('waifu');
  if (waifu) waifu.style.display = 'none';
}

// 页面加载时恢复 Live2D 状态
(function initLive2d() {
  if (isLive2dEnabled()) {
    // 延迟加载，等主 UI 渲染完
    setTimeout(loadLive2dWidget, 1500);
  }
})();

// ========== 点击粒子特效 ==========
const CLICK_EFFECT_ENABLED_KEY = 'devtools-click-effect-enabled';
let clickEffectActive = false;

function isClickEffectEnabled() {
  return localStorage.getItem(CLICK_EFFECT_ENABLED_KEY) === 'true';
}

function toggleClickEffect(enabled) {
  localStorage.setItem(CLICK_EFFECT_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    enableClickEffect();
  } else {
    disableClickEffect();
  }
}

function enableClickEffect() {
  if (clickEffectActive) return;
  clickEffectActive = true;
  document.addEventListener('click', handleClickParticle, true);
}

function disableClickEffect() {
  clickEffectActive = false;
  document.removeEventListener('click', handleClickParticle, true);
}

function handleClickParticle(e) {
  const colors = [
    'rgba(167, 139, 250, 0.9)',  // 紫色（主题色）
    'rgba(129, 140, 248, 0.9)',  // 靛蓝
    'rgba(96, 165, 250, 0.85)',  // 蓝色
    'rgba(52, 211, 153, 0.85)',  // 绿色
    'rgba(251, 191, 36, 0.85)',  // 琥珀
    'rgba(244, 114, 182, 0.9)',  // 粉色
    'rgba(248, 113, 113, 0.85)', // 红色
  ];
  const particleCount = 7;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'click-particle';
    particle.style.left = e.clientX + 'px';
    particle.style.top = e.clientY + 'px';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

    // 随机方向和距离
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.8;
    const distance = 30 + Math.random() * 40;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const size = 4 + Math.random() * 4;

    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.setProperty('--tx', tx + 'px');
    particle.style.setProperty('--ty', ty + 'px');

    document.body.appendChild(particle);

    // 动画结束后移除
    particle.addEventListener('animationend', () => particle.remove());
  }
}

// 页面加载时恢复点击特效状态
(function initClickEffect() {
  if (isClickEffectEnabled()) {
    enableClickEffect();
  }
})();
