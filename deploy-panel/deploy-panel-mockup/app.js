// ========== Mock Data ==========
const PROJECTS = [
  { name:'kangzhan-cloud', type:'multi', tool:'Webpack', configured:true, lastDeploy:'30 分钟前', lastModules:'home, OMSorderManage',
    modules:['home','OMSorderManage','transportAdmin','trainingManage','transControl','mainDataManage','workFlow','qualityPlatform','portalManage','examSystem','BMScostModule','Authentication','coldManage','customer','dataInterfaceCfg','design','distributionCarManage','dmsOrderManage','infoManage','marketization','nationalManage','provinceCDC','smallBlackCard','websiteDesign','agree','additional'] },
  { name:'inz-pc', type:'multi', tool:'Webpack', configured:true, lastDeploy:'2 小时前', lastModules:'SystemModule',
    modules:['home','BMScostModule','Distribution','DynmicScript','Gtp','IntegrationPlatform','MDMmainDataModule','Mip','OMSorderModule','SystemModule','TMStransportModule','WMSstoreModule','WorkFlow','agree','logisticsManage','marketization','nationalManage'] },
  { name:'jms-pc', type:'multi', tool:'Webpack', configured:true, lastDeploy:'昨天', lastModules:'home, Distribution',
    modules:['home','BMScostModule','Distribution','DynmicScript','Gtp','IntegrationPlatform','MDMmainDataModule','Mip','OMSorderModule','SystemModule','TMStransportModule','WMSstoreModule','WorkFlow','agree','logisticsManage','marketization'] },
  { name:'ss-pc', type:'multi', tool:'Webpack', configured:false, lastDeploy:'—', lastModules:'',
    modules:['home','BMScostModule','Distribution','SystemModule','TMStransportModule','WMSstoreModule','WorkFlow','agree','logisticsManage','marketization'] },
  { name:'netaxfront', type:'single', tool:'Vite', configured:true, lastDeploy:'1 小时前', lastModules:'', modules:[] },
  { name:'emergency-web', type:'single', tool:'Vue CLI', configured:true, lastDeploy:'3 天前', lastModules:'', modules:[] },
  { name:'moutai-wl', type:'single', tool:'Webpack', configured:false, lastDeploy:'—', lastModules:'', modules:[] },
  { name:'inz-web-portal', type:'single', tool:'Vite', configured:true, lastDeploy:'5 小时前', lastModules:'', modules:[] },
  { name:'inz-tdp-running-pc', type:'single', tool:'Vue CLI', configured:false, lastDeploy:'—', lastModules:'', modules:[] },
  { name:'tongrentang', type:'single', tool:'Webpack', configured:true, lastDeploy:'1 周前', lastModules:'', modules:[] },
  { name:'moutai-jt', type:'multi', tool:'Webpack', configured:true, lastDeploy:'2 天前', lastModules:'home',
    modules:['home','orderManage','transportManage','systemModule','dataManage','reportCenter'] },
  { name:'dcl-pc', type:'single', tool:'Vue CLI', configured:false, lastDeploy:'—', lastModules:'', modules:[] },
];

const SERVERS = [
  { name:'生产-茅台物流', host:'172.29.121.47', port:22, user:'root', path:'/var/www/' },
  { name:'生产-师帅', host:'223.76.236.149', port:8082, user:'deploy', path:'/opt/nginx/html/' },
  { name:'测试服务器', host:'223.76.236.139', port:22, user:'root', path:'/var/www/test/' },
  { name:'开发服务器', host:'10.3.87.33', port:22, user:'dev', path:'/home/dev/www/' },
];

const HISTORY = [
  { time:'2026-05-09 11:20', project:'kangzhan-cloud', modules:['home','OMSorderManage'], server:'生产-茅台物流', status:'success', duration:'2m 30s' },
  { time:'2026-05-09 10:15', project:'inz-pc', modules:['SystemModule'], server:'生产-师帅', status:'success', duration:'1m 45s' },
  { time:'2026-05-09 09:00', project:'netaxfront', modules:['整体构建'], server:'测试服务器', status:'success', duration:'0m 52s' },
  { time:'2026-05-08 17:30', project:'jms-pc', modules:['home','Distribution','WorkFlow'], server:'生产-茅台物流', status:'success', duration:'3m 12s' },
  { time:'2026-05-08 16:00', project:'emergency-web', modules:['整体构建'], server:'测试服务器', status:'fail', duration:'0m 15s' },
  { time:'2026-05-08 14:20', project:'kangzhan-cloud', modules:['transportAdmin','transControl'], server:'生产-茅台物流', status:'success', duration:'2m 08s' },
  { time:'2026-05-07 11:00', project:'inz-pc', modules:['home','TMStransportModule','WMSstoreModule'], server:'生产-师帅', status:'success', duration:'4m 22s' },
];

const LOG_LINES = [
  { text:'$ npm run build home OMSorderManage', cls:'log-cmd' },
  { text:'> kangzhan-cloud@1.0.0 build', cls:'log-info' },
  { text:'> node build/build.js home OMSorderManage', cls:'log-info' },
  { text:'', cls:'log-info' },
  { text:'building for production...', cls:'log-info' },
  { text:'[=== ] 12% building modules...', cls:'log-info' },
  { text:'[===== ] 34% optimizing chunks...', cls:'log-info' },
  { text:'[======== ] 56% asset optimization...', cls:'log-info' },
  { text:'[=========== ] 78% emitting assets...', cls:'log-info' },
  { text:'[==============] 100%', cls:'log-success' },
  { text:'', cls:'log-info' },
  { text:'✓ Module [home] built successfully (1.2MB)', cls:'log-success' },
  { text:'✓ Module [OMSorderManage] built successfully (890KB)', cls:'log-success' },
  { text:'  Build complete. (23.4s)', cls:'log-success' },
  { text:'', cls:'log-info' },
  { text:'📦 Compressing dist/home/ → home.tar.gz (456KB)', cls:'log-info' },
  { text:'📦 Compressing dist/OMSorderManage/ → OMSorderManage.tar.gz (312KB)', cls:'log-info' },
  { text:'', cls:'log-info' },
  { text:'🔗 Connecting to 172.29.121.47:22 ...', cls:'log-cmd' },
  { text:'✓ SSH connection established', cls:'log-success' },
  { text:'', cls:'log-info' },
  { text:'⬆ Uploading home.tar.gz ... 100%', cls:'log-info' },
  { text:'📂 Backing up /var/www/kangzhan-cloud/home/ → home.bak.20260509', cls:'log-warn' },
  { text:'📂 Extracting home.tar.gz → /var/www/kangzhan-cloud/home/', cls:'log-info' },
  { text:'✓ Module [home] deployed successfully', cls:'log-success' },
  { text:'', cls:'log-info' },
  { text:'⬆ Uploading OMSorderManage.tar.gz ... 100%', cls:'log-info' },
  { text:'📂 Backing up /var/www/kangzhan-cloud/OMSorderManage/ → OMSorderManage.bak.20260509', cls:'log-warn' },
  { text:'📂 Extracting → /var/www/kangzhan-cloud/OMSorderManage/', cls:'log-info' },
  { text:'✓ Module [OMSorderManage] deployed successfully', cls:'log-success' },
  { text:'', cls:'log-info' },
  { text:'🎉 All modules deployed successfully! Total time: 2m 34s', cls:'log-success' },
];

// ========== Render Functions ==========
let currentProject = null;
let checkedModules = new Set();

function renderProjects(filter = '') {
  const grid = document.getElementById('projectGrid');
  const filtered = PROJECTS.filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  grid.innerHTML = filtered.map(p => `
    <div class="project-card" onclick="openDeploy('${p.name}')">
      <div class="card-top">
        <div class="card-name">${p.type==='multi'?'📦':'📄'} ${p.name}</div>
        <span class="card-badge ${p.type==='multi'?'badge-multi':'badge-single'}">${p.type==='multi'?'多模块':'单体'}</span>
      </div>
      <div class="card-meta">
        <span><span class="badge-tool">${p.tool}</span> ${p.type==='multi'? p.modules.length+' 个模块':''}</span>
        <span>最近部署: ${p.lastDeploy}${p.lastModules?' · '+p.lastModules:''}</span>
      </div>
      ${p.type==='multi'?`<div class="card-modules">${p.modules.slice(0,5).map(m=>`<span class="module-tag">${m}</span>`).join('')}${p.modules.length>5?`<span class="module-more">+${p.modules.length-5}</span>`:''}</div>`:''}
      <div class="card-status ${p.configured?'status-configured':'status-unconfigured'}">
        ${p.configured?'● 已配置服务器':'○ 未配置服务器'}
      </div>
      <button class="btn-deploy-card" onclick="event.stopPropagation();openDeploy('${p.name}')">🚀 部署</button>
    </div>
  `).join('');
}

function renderServers() {
  document.getElementById('serverList').innerHTML = SERVERS.map(s => `
    <div class="server-card">
      <div class="server-info">
        <div class="server-icon">🖥</div>
        <div><div class="server-name">${s.name}</div><div class="server-host">${s.user}@${s.host}:${s.port} → ${s.path}</div></div>
      </div>
      <div class="server-actions">
        <button class="btn-icon" title="编辑">✎</button>
        <button class="btn-icon" title="测试连接">⚡</button>
        <button class="btn-icon danger" title="删除">🗑</button>
      </div>
    </div>
  `).join('');
}

function renderHistory() {
  document.getElementById('historyTable').innerHTML = `
    <div class="history-row header"><span>时间</span><span>项目</span><span>模块</span><span>服务器</span><span>状态</span><span>操作</span></div>
    ${HISTORY.map(h => `<div class="history-row">
      <span>${h.time}</span>
      <span style="font-weight:600">${h.project}</span>
      <span class="history-modules">${h.modules.map(m=>`<span class="module-tag">${m}</span>`).join('')}</span>
      <span>${h.server}</span>
      <span class="${h.status==='success'?'status-success':'status-fail'}">${h.status==='success'?'✅ 成功 '+h.duration:'❌ 失败'}</span>
      <span>${h.status==='success'?'<button class="btn-rollback">回滚</button>':''}</span>
    </div>`).join('')}
  `;
}

// ========== Modal Logic ==========
function openDeploy(name) {
  currentProject = PROJECTS.find(p => p.name === name);
  if (!currentProject) return;
  checkedModules.clear();
  const modal = document.getElementById('deployModal');
  document.getElementById('modalTitle').textContent = currentProject.name;
  document.getElementById('modalSubtitle').textContent = currentProject.type === 'multi'
    ? `多模块项目 · ${currentProject.modules.length} 个可部署模块`
    : `单体项目 · ${currentProject.tool}`;
  document.getElementById('remotePath').value = `/var/www/${currentProject.name}/`;
  document.getElementById('singleView').style.display = currentProject.type === 'single' ? 'block' : 'none';
  document.getElementById('multiView').style.display = currentProject.type === 'multi' ? 'block' : 'none';
  if (currentProject.type === 'multi') renderModules();
  modal.classList.add('active');
}

function renderModules(filter = '') {
  const grid = document.getElementById('moduleGrid');
  const filtered = currentProject.modules.filter(m => !filter || m.toLowerCase().includes(filter.toLowerCase()));
  grid.innerHTML = filtered.map(m => `
    <div class="module-item ${checkedModules.has(m)?'checked':''}" onclick="toggleModule('${m}',this)">
      <div class="checkbox">${checkedModules.has(m)?'✓':''}</div>
      <span>${m}</span>
    </div>
  `).join('');
  document.getElementById('selectedCount').textContent = `已选 ${checkedModules.size} 个`;
}

function toggleModule(name, el) {
  checkedModules.has(name) ? checkedModules.delete(name) : checkedModules.add(name);
  renderModules(document.getElementById('moduleSearch').value);
}

function toggleAll(check) {
  if (check) currentProject.modules.forEach(m => checkedModules.add(m));
  else checkedModules.clear();
  renderModules(document.getElementById('moduleSearch').value);
}

function filterModules() { renderModules(document.getElementById('moduleSearch').value); }
function closeModal() { document.getElementById('deployModal').classList.remove('active'); }

// ========== Deploy Simulation ==========
function startDeploy() { closeModal(); simulateDeploy(false); }
function startBuildOnly() { closeModal(); simulateDeploy(true); }

function simulateDeploy(buildOnly) {
  const modal = document.getElementById('logModal');
  const modules = currentProject.type === 'multi' ? [...checkedModules] : ['整体构建'];
  document.getElementById('logSubtitle').textContent = `${currentProject.name} · ${modules.join(', ')} → ${document.getElementById('targetServer').value}`;
  document.getElementById('logTerminal').innerHTML = '';
  document.getElementById('deployResult').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '0%';

  const steps = buildOnly ? ['构建中'] : ['构建中', '压缩中', '上传中', '部署中'];
  document.getElementById('progressSteps').innerHTML = steps.map((s,i) =>
    `<div class="step${i===0?' active':''}" id="step${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');

  modal.classList.add('active');

  const lines = buildOnly ? LOG_LINES.slice(0, 14) : LOG_LINES;
  let i = 0;
  const terminal = document.getElementById('logTerminal');

  const timer = setInterval(() => {
    if (i >= lines.length) {
      clearInterval(timer);
      document.getElementById('deployResult').style.display = 'flex';
      document.getElementById('progressBar').style.width = '100%';
      document.getElementById('progressText').textContent = '100%';
      document.querySelectorAll('.step').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
      return;
    }
    const line = lines[i];
    terminal.innerHTML += `<div class="log-line ${line.cls}">${line.text}</div>`;
    terminal.scrollTop = terminal.scrollHeight;

    const pct = Math.round(((i + 1) / lines.length) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressText').textContent = pct + '%';

    const stepIdx = Math.floor((i / lines.length) * steps.length);
    document.querySelectorAll('.step').forEach((s, si) => {
      s.classList.toggle('active', si === stepIdx);
      s.classList.toggle('done', si < stepIdx);
    });
    i++;
  }, 120);
}

function closeLogModal() { document.getElementById('logModal').classList.remove('active'); }
function showAddServer() { document.getElementById('addServerModal').classList.add('active'); }

// ========== Tab Navigation ==========
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

document.getElementById('searchInput').addEventListener('input', e => renderProjects(e.target.value));

// ========== Init ==========
renderProjects();
renderServers();
renderHistory();
