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

  // 自动更新开关同步
  const autoCheckCb = document.getElementById('settingAutoCheckUpdate');
  if (autoCheckCb) autoCheckCb.checked = localStorage.getItem('devtools-auto-check-update') !== 'false';

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
      
      // 同步全局状态与侧边栏
      hasGlobalPendingUpdate = true;
      globalUpdateCommits = data.commits || [];
      showGlobalUpgradeIndicator(true);
    } else {
      if (item) item.style.display = 'none';
      hasGlobalPendingUpdate = false;
      showGlobalUpgradeIndicator(false);
    }
  } catch (e) {}
}

function toggleAutoCheckUpdate(enabled) {
  localStorage.setItem('devtools-auto-check-update', enabled ? 'true' : 'false');
  if (enabled) {
    if (typeof initGlobalAutoUpgrade === 'function') initGlobalAutoUpgrade();
    if (typeof checkGlobalUpgrade === 'function') checkGlobalUpgrade(true);
  } else {
    if (typeof autoUpdateInterval !== 'undefined' && autoUpdateInterval) clearInterval(autoUpdateInterval);
    if (typeof showGlobalUpgradeIndicator === 'function') showGlobalUpgradeIndicator(false);
  }
}

let upgradePolling = null;

async function startUpgrade(skipConfirm = false) {
  if (!window.__TAURI__) return;

  const { check } = window.__TAURI__.updater;
  let update;
  try {
    update = await check();
  } catch (err) {
    showAlert('检查更新失败: ' + err.message, { icon: '❌' });
    return;
  }

  if (!update || !update.available) {
    showAlert('您当前已是最新版本，无需更新！', { icon: '✨' });
    return;
  }

  if (!skipConfirm) {
    const ok = await showConfirm(`确定要更新应用到 v${update.version} 吗？\n\n更新包大小：${Math.round((update.bodyLength || 0) / 1024 / 1024 * 10) / 10} MB\n升级将自动下载最新发布包并替换重启。`, { confirmText: '立即更新' });
    if (!ok) return;
  }

  const btn = document.getElementById('btnUpgrade');
  const logEl = document.getElementById('upgradeLog');
  const modal = document.getElementById('upgradeModal');
  const fill = document.getElementById('upgradeProgressFill');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '更新中...';
  }

  if (modal) modal.classList.add('active');
  if (logEl) logEl.textContent = `开始升级至 v${update.version}...\n`;
  if (fill) fill.style.width = '0%';

  try {
    let downloaded = 0;
    let contentLength = update.bodyLength || 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || contentLength;
          if (logEl) logEl.textContent += `[1/3] 开始下载安装包...\n`;
          if (fill) fill.style.width = '5%';
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          const percent = contentLength > 0 ? Math.round((downloaded / contentLength) * 90) : 50;
          if (fill) fill.style.width = `${percent}%`;
          if (logEl) {
            logEl.textContent = `[1/3] 正在下载新版本: ${percent}%\n`;
          }
          break;
        case 'Finished':
          if (fill) fill.style.width = '90%';
          if (logEl) logEl.textContent += `[2/3] 下载完成，正在进行签名校验与覆盖安装...\n`;
          break;
      }
    });

    if (fill) fill.style.width = '100%';
    if (logEl) logEl.textContent += `[3/3] 安装成功！即将自动重启应用...\n`;

  } catch (err) {
    if (fill) {
      fill.style.width = '100%';
      fill.style.background = 'var(--danger)';
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = '立即更新';
    }
    if (logEl) logEl.textContent += `\n[ERROR] 升级失败: ${err.message}\n`;
    setTimeout(() => {
      if (modal) modal.classList.remove('active');
      showAlert('升级失败，请检查网络或配置: ' + err.message, { icon: '❌' });
    }, 3000);
  }
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
