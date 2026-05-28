/**
 * IP 纯净度检测 - 前端控制逻辑
 */

// 状态管理
let isIpCheckInitialized = false;

/**
 * 页面切换至 IP 检测时的初始化入口
 */
function initIpCheck() {
  // 绑定回车事件
  const input = document.getElementById('ipcheckInput');
  if (input && !input.dataset.bound) {
    input.dataset.bound = 'true';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        queryIpCheck();
      }
    });
  }

  // 首次打开自动查询本地公网 IP 纯净度
  if (!isIpCheckInitialized) {
    queryMyIpCheck();
    isIpCheckInitialized = true;
  }
}

/**
 * 检测指定 IP / 域名的纯净度
 */
async function queryIpCheck() {
  const input = document.getElementById('ipcheckInput');
  const target = input ? input.value.trim() : '';
  
  if (target) {
    // 简单验证 IP 或域名格式
    const isIp = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(target) || target.includes(':');
    const isDomain = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\.?$/.test(target);
    
    if (!isIp && !isDomain) {
      showToast('⚠️ 输入错误', '请输入有效的 IP 地址或域名');
      return;
    }
  }

  await doIpCheckLookup(target);
}

/**
 * 检测我本地当前的公网 IP
 */
async function queryMyIpCheck() {
  const input = document.getElementById('ipcheckInput');
  if (input) input.value = '';
  await doIpCheckLookup('');
}

/**
 * 调用后端 API 进行检测
 */
async function doIpCheckLookup(ipOrDomain) {
  // 1. 切换为骨架屏状态
  toggleIpCheckUIState('loading');

  try {
    const url = `/api/ipcheck/lookup${ipOrDomain ? `?ip=${encodeURIComponent(ipOrDomain)}` : ''}`;
    const data = await API.get(url);

    if (data.error) {
      showToast('❌ 查询失败', data.error);
      toggleIpCheckUIState('empty');
      return;
    }

    // 2. 渲染数据
    renderIpCheckDashboard(data);
    toggleIpCheckUIState('data');
  } catch (err) {
    console.error('[IPCheck] Request error:', err);
    showToast('❌ 系统错误', err.message || '网络连接异常');
    toggleIpCheckUIState('empty');
  }
}

/**
 * 切换页面状态 (empty / loading / data)
 */
function toggleIpCheckUIState(state) {
  const empty = document.getElementById('ipcheckEmpty');
  const skeleton = document.getElementById('ipcheckSkeleton');
  const dashboard = document.getElementById('ipcheckDashboard');

  if (state === 'loading') {
    empty.style.display = 'none';
    skeleton.style.display = 'grid';
    dashboard.style.display = 'none';
  } else if (state === 'data') {
    empty.style.display = 'none';
    skeleton.style.display = 'none';
    dashboard.style.display = 'grid';
  } else {
    empty.style.display = 'flex';
    skeleton.style.display = 'none';
    dashboard.style.display = 'none';
  }
}

/**
 * 渲染数据看板
 */
function renderIpCheckDashboard(data) {
  // 基本信息
  document.getElementById('ipcValIp').textContent = data.ip || '-';
  document.getElementById('ipcValLocation').textContent = data.location || '-';
  document.getElementById('ipcValAsn').textContent = data.asn || '-';
  
  // 转换 IP 数字表示
  let ipNumText = '-';
  if (data.ip) {
    const cleanIp = data.ip.trim().split(':')[0]; // IPv4 提取
    if (/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(cleanIp)) {
      const parts = cleanIp.split('.').map(Number);
      if (parts.length === 4) {
        const num = parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
        ipNumText = String(num);
      }
    }
  }
  document.getElementById('ipcValIpNum').textContent = ipNumText;

  // ASN 所有者 (显示类别标记)
  const ownerEl = document.getElementById('ipcValAsnOwner');
  ownerEl.innerHTML = '';
  if (data.asn_owner_type) {
    const badge = document.createElement('span');
    badge.className = `ipc-badge ${data.asn_owner_type.toLowerCase() === 'isp' ? 'isp' : 'idc'}`;
    badge.textContent = data.asn_owner_type;
    ownerEl.appendChild(badge);
  }
  const ownerText = document.createTextNode(' ' + (data.asn_owner || '-'));
  ownerEl.appendChild(ownerText);

  // 企业
  const orgEl = document.getElementById('ipcValOrg');
  orgEl.innerHTML = '';
  if (data.org_type) {
    const badge = document.createElement('span');
    badge.className = `ipc-badge ${data.org_type.toLowerCase() === 'isp' ? 'isp' : 'idc'}`;
    badge.textContent = data.org_type;
    orgEl.appendChild(badge);
  }
  const orgText = document.createTextNode(' ' + (data.org || '-'));
  orgEl.appendChild(orgText);

  // 经纬度
  document.getElementById('ipcValCoords').textContent = `${data.longitude || '-'}, ${data.latitude || '-'}`;

  // 共享人数大卡片渲染
  const sharedStr = data.shared_users || '';
  const sharedMatch = sharedStr.match(/^([^\s(]+)\s*(?:\(([^)]+)\))?$/);
  
  let sharedScoreVal = '-';
  let sharedLabelVal = '未知';
  let sharedFillPercent = '0%';
  let sharedStatusClass = 'info';
  
  if (sharedMatch) {
    sharedScoreVal = sharedMatch[1];
    sharedLabelVal = sharedMatch[2] || '未知';
  } else {
    sharedScoreVal = sharedStr || '-';
  }
  
  if (sharedStr.includes('极好') || sharedStr.includes('1 - 5') || sharedStr.includes('1 - 10')) {
    sharedFillPercent = '95%';
    sharedStatusClass = 'safe';
  } else if (sharedStr.includes('良好') || sharedStr.includes('10 - 20')) {
    sharedFillPercent = '70%';
    sharedStatusClass = 'clean';
  } else if (sharedStr.includes('较差') || sharedStr.includes('50 - 100')) {
    sharedFillPercent = '40%';
    sharedStatusClass = 'warning';
  } else if (sharedStr.includes('极差') || sharedStr.includes('100+') || sharedStr.includes('共享') || sharedStr.includes('1000+')) {
    sharedFillPercent = '15%';
    sharedStatusClass = 'danger';
  }
  
  const sharedScoreEl = document.getElementById('ipcValSharedScore');
  const sharedLabelEl = document.getElementById('ipcValSharedLabel');
  const sharedFillBar = document.getElementById('ipcSharedFill');
  
  if (sharedScoreEl) sharedScoreEl.textContent = sharedScoreVal;
  if (sharedLabelEl) {
    sharedLabelEl.textContent = sharedLabelVal;
    sharedLabelEl.className = `shared-card-status status-badge ${sharedStatusClass}`;
  }
  if (sharedFillBar) {
    sharedFillBar.style.width = sharedFillPercent;
    sharedFillBar.className = `shared-bar-fill ${sharedStatusClass}`;
  }

  // 原生 IP
  const nativeEl = document.getElementById('ipcValNative');
  nativeEl.textContent = data.native_ip || '-';
  nativeEl.className = 'status-badge';
  if (data.native_ip && data.native_ip.includes('原生')) {
    nativeEl.classList.add('safe');
  } else {
    nativeEl.classList.add('warning');
  }

  // 大模型可用性
  const aiSupportEl = document.getElementById('ipcValOpenAiSupport');
  if (aiSupportEl) {
    aiSupportEl.textContent = data.openai_support || '未知';
    aiSupportEl.className = 'status-badge';
    if (data.openai_support && data.openai_support.includes('完美支持')) {
      aiSupportEl.classList.add('safe');
    } else if (data.openai_support && data.openai_support.includes('限制')) {
      aiSupportEl.classList.add('danger');
    } else {
      aiSupportEl.classList.add('warning');
    }
  }

  // 风控值
  const scoreStr = data.risk_score || '0%';
  const scoreNum = parseInt(scoreStr, 10) || 0;
  document.getElementById('ipcValRiskScore').textContent = scoreStr;
  
  const fillBar = document.getElementById('ipcRiskFill');
  fillBar.style.width = scoreStr;
  
  // 调整进度条填充颜色
  fillBar.className = 'gauge-bar-fill'; // 重置
  if (scoreNum <= 15) {
    fillBar.classList.add('safe');
  } else if (scoreNum <= 25) {
    fillBar.classList.add('clean');
  } else if (scoreNum <= 50) {
    fillBar.classList.add('warning');
  } else {
    fillBar.classList.add('danger');
  }

  // 风控大卡片动态氛围呼吸光
  const riskPanel = document.querySelector('.ipcheck-risk-panel');
  if (riskPanel) {
    riskPanel.classList.remove('safe', 'warning', 'danger');
    if (scoreNum <= 25) {
      riskPanel.classList.add('safe');
    } else if (scoreNum <= 50) {
      riskPanel.classList.add('warning');
    } else {
      riskPanel.classList.add('danger');
    }
  }

  // 风控标签
  const riskLbl = document.getElementById('ipcValRiskLabel');
  riskLbl.textContent = data.risk_label || '安全';
  riskLbl.className = 'status-badge';
  if (scoreNum <= 25) riskLbl.classList.add('safe');
  else if (scoreNum <= 50) riskLbl.classList.add('warning');
  else riskLbl.classList.add('danger');

  // 保留原有兼容（如存在）
  const typeEl = document.getElementById('ipcValIpType');
  if (typeEl) {
    typeEl.textContent = data.ip_type || '-';
    typeEl.className = 'status-badge';
    if (data.ip_type && data.ip_type.includes('家庭')) {
      typeEl.classList.add('safe');
    } else {
      typeEl.classList.add('idc');
    }
  }

  // 场景星级渲染
  const grid = document.getElementById('ipcScenariosGrid');
  grid.innerHTML = '';

  if (data.scenarios && data.scenarios.length > 0) {
    const emojiMap = {
      'TikTok': '🎬',
      '跨境电商': '🛍️',
      '社媒运营': '📱',
      'AI 应用': '🧠',
      'AI应用': '🧠'
    };
    data.scenarios.forEach(scene => {
      const card = document.createElement('div');
      card.className = 'scene-recommendation-card';
      
      // 根据建议匹配等级的颜色
      let adviceClass = 'info';
      if (scene.advice.includes('适合') || scene.advice.includes('优秀') || scene.advice.includes('支持')) {
        adviceClass = 'safe';
      } else if (scene.advice.includes('尝试') || scene.advice.includes('一般')) {
        adviceClass = 'warning';
      } else if (scene.advice.includes('限制') || scene.advice.includes('高危') || scene.advice.includes('失败')) {
        adviceClass = 'danger';
      }

      const emoji = emojiMap[scene.name] || '💡';

      card.innerHTML = `
        <div class="scene-icon">${emoji}</div>
        <div class="scene-info">
          <div class="scene-title-row">
            <span class="scene-name">${scene.name}</span>
            <span class="scene-stars">${scene.stars}</span>
          </div>
          <div class="scene-advice ${adviceClass}">${scene.advice}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  } else {
    grid.innerHTML = '<div class="home-empty-hint">暂无该 IP 的适用场景评估数据</div>';
  }
}
