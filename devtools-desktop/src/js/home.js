// ========== Module: Home (首页) ==========

// DOM 元素缓存（避免每秒 getElementById）
let _homeDateEl = null;
let _homeGreetingEl = null;

function initHomePage() {
  updateHomeDateTime();
  // 每秒更新一次时间（仅首页可见时）
  setInterval(updateHomeDateTime, 1000);
  loadHomeData();
  // 加载每日一言和天气
  loadHitokoto();
  loadWeather();
}

function updateHomeDateTime() {
  // 非首页时跳过 DOM 操作
  const homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  if (!_homeDateEl) _homeDateEl = document.getElementById('homeDate');
  if (!_homeGreetingEl) _homeGreetingEl = document.getElementById('homeGreeting');
  if (!_homeDateEl || !_homeGreetingEl) return;

  const now = new Date();
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  _homeDateEl.textContent = `今天是 ${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日，${weekdays[now.getDay()]} ${timeStr}`;

  // 问候语
  const hour = now.getHours();
  let greeting = '晚上好 🌙';
  if (hour < 6) greeting = '夜深了 🌙';
  else if (hour < 12) greeting = '上午好 ☀️';
  else if (hour < 14) greeting = '中午好 🌤';
  else if (hour < 18) greeting = '下午好 👋';
  _homeGreetingEl.textContent = greeting;
}

// ========== 首页小组件：每日一言 ==========
async function loadHitokoto() {
  const textEl = document.getElementById('hitokotoText');
  const sourceEl = document.getElementById('hitokotoSource');
  try {
    const res = await fetch('https://v1.hitokoto.cn/?c=d&c=i&c=k&encode=json');
    const data = await res.json();
    textEl.textContent = `「${data.hitokoto}」`;
    sourceEl.textContent = data.from ? `—— ${data.from}` : '';
  } catch (e) {
    textEl.textContent = '「保持专注，持续交付。」';
    sourceEl.textContent = '';
  }
}

// ========== 首页小组件：天气 ==========
const WEATHER_ZH_MAP = {
  'sunny': '晴', 'clear': '晴', 'partly cloudy': '多云', 'cloudy': '阴',
  'overcast': '阴', 'mist': '薄雾', 'fog': '雾', 'freezing fog': '冻雾',
  'patchy rain possible': '可能有小雨', 'patchy rain nearby': '附近有小雨',
  'light rain': '小雨', 'light rain shower': '小阵雨',
  'moderate rain': '中雨', 'moderate rain at times': '时有中雨',
  'heavy rain': '大雨', 'heavy rain at times': '时有大雨',
  'moderate or heavy rain shower': '中到大阵雨',
  'moderate or heavy rain with thunder': '雷暴雨',
  'torrential rain shower': '暴雨', 'light drizzle': '毛毛雨',
  'patchy light drizzle': '零星小雨', 'patchy light rain': '零星小雨',
  'light freezing rain': '冻雨', 'thundery outbreaks possible': '可能有雷阵雨',
  'patchy snow possible': '可能有雪', 'light snow': '小雪',
  'moderate snow': '中雪', 'heavy snow': '大雪', 'blizzard': '暴风雪',
  'light sleet': '小雨夹雪', 'moderate or heavy sleet': '雨夹雪',
};

async function loadWeather() {
  const iconEl = document.getElementById('weatherIcon');
  const tempEl = document.getElementById('weatherTemp');
  const descEl = document.getElementById('weatherDesc');
  const locEl = document.getElementById('weatherLocation');
  try {
    const res = await fetch('https://wttr.in/Wuhan?format=j1&lang=zh');
    const data = await res.json();
    const current = data.current_condition[0];
    const temp = current.temp_C;
    const rawDesc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '';
    const humidity = current.humidity;
    const feelsLike = current.FeelsLikeC;
    const weatherCode = parseInt(current.weatherCode);

    // 尝试中文映射
    const desc = WEATHER_ZH_MAP[rawDesc.toLowerCase()] || rawDesc;

    // 根据天气代码映射图标
    let icon = '☁';
    if (weatherCode === 113) icon = '☀️';
    else if (weatherCode === 116) icon = '⛅';
    else if (weatherCode === 119 || weatherCode === 122) icon = '☁️';
    else if ([176,263,266,293,296,299,302,305,308,311,314,317,353,356,359].includes(weatherCode)) icon = '🌧';
    else if ([200,386,389,392,395].includes(weatherCode)) icon = '⛈';
    else if ([227,230,323,326,329,332,335,338,350,368,371,374,377].includes(weatherCode)) icon = '❄️';
    else if ([143,248,260].includes(weatherCode)) icon = '🌫';

    iconEl.textContent = icon;
    tempEl.textContent = `${temp}°C`;
    descEl.textContent = `${desc} · 体感 ${feelsLike}°C · 湿度 ${humidity}%`;
    locEl.textContent = '武汉';
  } catch (e) {
    iconEl.textContent = '☁';
    tempEl.textContent = '--°';
    descEl.textContent = '天气获取失败';
    locEl.textContent = '';
  }
}

async function loadHomeData() {
  try {
    // 加载历史数据
    const history = await API.get('/api/history');
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));

    const thisWeek = history.filter(h => {
      const time = new Date(h.timestamp).getTime();
      return time >= weekStart.getTime() && time <= now.getTime();
    });

    // ===== 待办提醒 =====
    try {
      const todos = await API.get('/api/todos');
      const doing = todos.filter(t => t.status === 'doing');
      const todoList = document.getElementById('homeTodoList');
      if (todoList) {
        if (doing.length === 0) {
          todoList.innerHTML = '<div class="home-empty-state"><span class="home-empty-icon">📌</span><span>暂无进行中的任务</span></div>';
        } else {
          todoList.innerHTML = doing.slice(0, 5).map(t => {
            const remind = t.remindAt ? `<span class="todo-remind-tag">⏰ ${new Date(t.remindAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>` : '';
            return `<div class="home-todo-item"><span class="todo-status-dot"></span><span>${escapeHtml(t.title)}</span>${remind}</div>`;
          }).join('');
        }
      }
    } catch (e) { console.warn('[Home] 加载待办失败:', e.message); }

    // ===== 今日工时 =====
    try {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const note = await API.get('/api/notes/' + todayStr).catch(() => null);
      const timesheet = document.getElementById('homeTimesheet');
      if (timesheet) {
        if (note && note.content) {
          timesheet.textContent = note.content.slice(0, 120) + (note.content.length > 120 ? '...' : '');
        } else {
          timesheet.innerHTML = '<div class="home-empty-state"><span class="home-empty-icon">✏️</span><span>今天尚未填写工时</span></div>';
        }
      }
    } catch (e) { console.warn("[Home] 加载工时失败:", e.message); }

    // ===== 运行状态 =====
    const activeRuns = Object.values(runningProjects || {}).filter(job => ['starting', 'running'].includes(job.status));
    const runList = document.getElementById('homeRunningList');
    if (runList) {
      if (activeRuns.length === 0) {
        runList.innerHTML = '<div class="home-empty-state"><span class="home-empty-icon">▶</span><span>无运行中的服务</span></div>';
      } else {
        runList.innerHTML = activeRuns.slice(0, 4).map(job => {
          const name = job.displayName || job.projectName || '未知';
          return `<div class="home-todo-item"><span class="todo-status-dot" style="background:var(--success)"></span><span>${escapeHtml(name)}</span></div>`;
        }).join('');
      }
    }

    // ===== 本周概览 =====
    const weekStats = document.getElementById('homeWeekStats');
    if (weekStats) {
      const deployCount = thisWeek.filter(h => h.type === 'deploy').length;
      const buildCount = thisWeek.filter(h => h.type !== 'deploy').length;
      const successCount = thisWeek.filter(h => h.status === 'success').length;
      const rate = thisWeek.length > 0 ? Math.round(successCount / thisWeek.length * 100) : 0;
      weekStats.innerHTML = `
        <div class="home-stat-item"><div class="stat-num">${thisWeek.length}</div><div class="stat-label">本周操作</div></div>
        <div class="home-stat-item"><div class="stat-num">${rate}%</div><div class="stat-label">成功率</div></div>
        <div class="home-stat-item"><div class="stat-num">${deployCount}</div><div class="stat-label">部署</div></div>
        <div class="home-stat-item"><div class="stat-num">${buildCount}</div><div class="stat-label">构建</div></div>
      `;
    }

    // ===== 最近动态（卡片列表） =====
    const activityEl = document.getElementById('homeActivity');
    const recent = history.slice(0, 5);
    if (activityEl) {
      if (recent.length === 0) {
        activityEl.innerHTML = '<div class="home-empty-hint">暂无活动记录</div>';
      } else {
        activityEl.innerHTML = recent.map(h => {
          const time = new Date(h.timestamp).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
          const typeLabel = h.type === 'deploy' ? '部署' : '构建';
          const statusCls = h.status === 'success' ? 'success' : 'fail';
          const statusText = h.status === 'success' ? '✅' : '❌';
          return `<div class="home-activity-item">
            <span class="ha-item-time">${time}</span>
            <span class="ha-item-project">${escapeHtml(h.projectName || '')}</span>
            <span class="ha-item-type">${typeLabel}</span>
            <span class="ha-item-status ${statusCls}">${statusText}</span>
            <span class="ha-item-duration">${h.duration || '—'}</span>
          </div>`;
        }).join('');
      }
    }

  } catch (e) {
    // 静默失败
  }
}

function refreshHomeIfVisible() {
  const homePage = document.getElementById('page-home');
  if (homePage && homePage.classList.contains('active')) {
    loadHomeData();
  }
}

function getHomeActivityTypeLabel(item) {
  if (item.type === 'deploy') return '部署';
  if (item.type === 'run') return '运行';
  return '构建';
}

function getHomeActivityStatus(item) {
  if (item.type === 'run') {
    if (item.status === 'warning') {
      return { dotCls: 'warning', statusCls: 'warning', statusText: '有报错', eventLabel: '本地运行异常' };
    }
    if (item.status === 'starting') {
      return { dotCls: 'running', statusCls: 'running', statusText: '启动中', eventLabel: '本地启动中' };
    }
    return { dotCls: 'running', statusCls: 'running', statusText: '运行中', eventLabel: '本地运行中' };
  }
  if (item.status === 'success') return { dotCls: 'success', statusCls: 'success', statusText: '成功' };
  if (item.status === 'running') return { dotCls: 'running', statusCls: 'running', statusText: '进行中' };
  return { dotCls: 'fail', statusCls: 'fail', statusText: '失败' };
}

function formatAverageDuration(history) {
  const seconds = history
    .map(item => parseDurationSeconds(item.duration))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!seconds.length) return '—';
  const avg = Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length);
  if (avg < 60) return `${avg}s`;
  const minutes = Math.floor(avg / 60);
  const remainSeconds = avg % 60;
  if (minutes < 60) return remainSeconds ? `${minutes}m ${remainSeconds}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function parseDurationSeconds(duration) {
  if (typeof duration === 'number') return duration;
  if (!duration) return NaN;
  const text = String(duration);
  let total = 0;
  const hour = text.match(/(\d+)\s*h/);
  const minute = text.match(/(\d+)\s*m/);
  const second = text.match(/(\d+)\s*s/);
  if (hour) total += Number(hour[1]) * 3600;
  if (minute) total += Number(minute[1]) * 60;
  if (second) total += Number(second[1]);
  if (total > 0) return total;
  const plain = text.match(/^(\d+)$/);
  return plain ? Number(plain[1]) : NaN;
}

async function refreshProjectIntroStatus() {
  const versionEl = document.getElementById('introVersion');
  const sidecarEl = document.getElementById('introSidecarStatus');
  const notificationEl = document.getElementById('introNotificationStatus');
  const dataDirEl = document.getElementById('introDataDir');

  if (versionEl) versionEl.textContent = `App ${APP_VERSION}`;
  if (notificationEl) {
    const granted = await isNotificationPermissionGranted();
    notificationEl.textContent = areNotificationsEnabled()
      ? (granted ? '已开启' : '等待授权')
      : '已关闭';
    notificationEl.className = areNotificationsEnabled() && granted ? 'ok' : 'warn';
  }

  try {
    const health = await API.get('/api/health');
    if (sidecarEl) {
      sidecarEl.textContent = `运行中 · PID ${health.pid || '—'}`;
      sidecarEl.className = 'ok';
    }
    if (dataDirEl) {
      dataDirEl.textContent = health.dataDir || 'sidecar/data';
      dataDirEl.title = health.dataDir || 'sidecar/data';
    }
  } catch (e) {
    if (sidecarEl) {
      sidecarEl.textContent = '未连接';
      sidecarEl.className = 'danger';
    }
    if (dataDirEl) dataDirEl.textContent = '读取失败';
  }
}
