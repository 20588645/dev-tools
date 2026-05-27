// ========== Module: Home (首页) ==========

// DOM 元素缓存（避免每秒 getElementById）
let _homeDateEl = null;
let _homeGreetingEl = null;
let _lastGreetingHour = -1;
let _cachedGreeting = '';

function initHomePage() {
  updateHomeDateTime();
  // 每秒更新一次时间（仅首页可见时）
  setInterval(updateHomeDateTime, 1000);
  loadHomeData();
  // 加载每日一言和天气
  loadHitokoto();
  loadWeather();
  // 初始化系统资源监控和番茄专注钟
  initSystemMonitorOnce();
  initPomodoroOnce();
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

  // 问候语 (按整点缓存更新，防止秒级刷新时随机文字跳动)
  const hour = now.getHours();
  if (hour !== _lastGreetingHour || !_cachedGreeting) {
    _lastGreetingHour = hour;
    
    let base = '晚上好 🌙';
    let suffixes = [
      '静心敲代码，世界都在你的指尖。',
      '今天辛苦了！记得按时提交工时哦。',
      '准备下班了吗？别忘了做分支的 Daily Push 哟。'
    ];
    
    if (hour < 6) {
      base = '夜深了 🌙';
      suffixes = [
        '夜猫子模式已启动，但要记得早点休息。',
        '这个时间写出的代码，灵感最纯粹。',
        '极客！代码很美，但也请早点休息。'
      ];
    } else if (hour < 12) {
      base = '上午好 ☀️';
      suffixes = [
        '今天也是元气满满、消灭 Bug 的一天！',
        '今天手感极佳，Bug 退散！',
        '一杯咖啡，开启高效的极客之旅。'
      ];
    } else if (hour < 14) {
      base = '中午好 🌤';
      suffixes = [
        '吃个饱饭，午休一下让大脑充充电。',
        '午餐时间到，今天的灵感指数依旧爆棚！'
      ];
    } else if (hour < 18) {
      base = '下午好 👋';
      suffixes = [
        '喝杯咖啡，站起来活动活动筋骨吧。',
        '下午手感爆棚，主攻核心模块！',
        '保持专注，今天又是高效开发的一天。'
      ];
    }
    
    const randSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    _cachedGreeting = `${base}，${randSuffix}`;
  }
  _homeGreetingEl.textContent = _cachedGreeting;

  // 极客时钟同步
  const clockEl = document.getElementById('geekTime');
  if (clockEl) {
    clockEl.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
  
  // UTC 协调时同步
  const utcEl = document.getElementById('geekTzUtc');
  if (utcEl) {
    const utcHours = String(now.getUTCHours()).padStart(2,'0');
    const utcMinutes = String(now.getUTCMinutes()).padStart(2,'0');
    utcEl.textContent = `${utcHours}:${utcMinutes}`;
  }

  // PDT 太平洋时间同步 (PDT = UTC - 7)
  const pdtEl = document.getElementById('geekTzPdt');
  if (pdtEl) {
    // 太平洋夏令时 PDT = UTC - 7 小时
    let pdtHours = now.getUTCHours() - 7;
    if (pdtHours < 0) pdtHours += 24;
    const pdtHoursStr = String(pdtHours).padStart(2,'0');
    const pdtMinutesStr = String(now.getUTCMinutes()).padStart(2,'0');
    pdtEl.textContent = `${pdtHoursStr}:${pdtMinutesStr}`;
  }

  // 极客太阳/月亮指示器同步
  const sunDot = document.getElementById('geekSunDot');
  if (sunDot) {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    const t = hours + minutes / 60 + seconds / 3600;
    
    let isDay = t >= 6 && t <= 18;
    let p = 0;
    if (isDay) {
      sunDot.textContent = '☀️';
      p = (t - 6) / 12;
    } else {
      sunDot.textContent = '🌙';
      if (t > 18) {
        p = (t - 18) / 12;
      } else {
        p = (t + 6) / 12;
      }
    }
    
    const theta = Math.PI * (1 - p);
    const dx = 60 * Math.cos(theta);
    const dy = 36 - 36 * Math.sin(theta);
    
    sunDot.style.left = `calc(50% + ${dx}px - 7px)`;
    sunDot.style.top = `${dy - 7}px`;
  }
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
        <div class="home-stat-item">
          <div class="stat-num">${thisWeek.length}</div>
          <div class="stat-label"><span>⚡</span><span>操作</span></div>
        </div>
        <div class="home-stat-item">
          <div class="stat-num">${deployCount}</div>
          <div class="stat-label"><span>🚀</span><span>部署</span></div>
        </div>
        <div class="home-stat-item">
          <div class="stat-num">${buildCount}</div>
          <div class="stat-label"><span>📦</span><span>构建</span></div>
        </div>
      `;

      // ===== 绘制周构建折线趋势图 =====
      const chartEl = document.getElementById('homeWeekChart');
      if (chartEl) {
        // 统计周一至周日每天的操作频次
        const counts = [0, 0, 0, 0, 0, 0, 0];
        const day = now.getDay();
        const diffToMonday = (day === 0 ? -6 : 1 - day);
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        const mondayTs = monday.getTime();

        (thisWeek || []).forEach(item => {
          const itemDate = new Date(item.timestamp);
          const diffDays = Math.floor((itemDate.getTime() - mondayTs) / (24 * 3600 * 1000));
          if (diffDays >= 0 && diffDays < 7) {
            counts[diffDays]++;
          }
        });

        // 演示保底数据，防止数据全零导致折线是一条底线
        const hasData = counts.some(c => c > 0);
        const displayCounts = hasData ? counts : [2, 1, 3, 2, 4, 1, 2];
        const maxVal = Math.max(...displayCounts, 4);

        // 控制 DEMO badge 提示
        const demoBadge = document.getElementById('chartDemoBadge');
        if (demoBadge) {
          demoBadge.style.display = hasData ? 'none' : 'inline-block';
        }

        // 精确的 SVG viewBox="0 0 240 100" 坐标系统
        // 底部界限为 75，顶部界限为 20，高度跨度为 55
        const xCoords = [15, 50, 85, 120, 155, 190, 225];
        const yCoords = displayCounts.map(c => 75 - (c / maxVal) * 55);
        
        // 三次贝塞尔曲线平滑路径生成 (C 命令)
        let linePath = `M ${xCoords[0]} ${yCoords[0]}`;
        for (let i = 0; i < 6; i++) {
          const cp1x = xCoords[i] + (xCoords[i+1] - xCoords[i]) / 2;
          const cp1y = yCoords[i];
          const cp2x = xCoords[i+1] - (xCoords[i+1] - xCoords[i]) / 2;
          const cp2y = yCoords[i+1];
          linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${xCoords[i+1]} ${yCoords[i+1]}`;
        }
        
        // 三次贝塞尔面积渐变路径生成
        let areaPath = `M ${xCoords[0]} 75`;
        for (let i = 0; i < 6; i++) {
          const cp1x = xCoords[i] + (xCoords[i+1] - xCoords[i]) / 2;
          const cp1y = yCoords[i];
          const cp2x = xCoords[i+1] - (xCoords[i+1] - xCoords[i]) / 2;
          const cp2y = yCoords[i+1];
          areaPath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${xCoords[i+1]} ${yCoords[i+1]}`;
        }
        areaPath += ` L ${xCoords[6]} 75 L ${xCoords[0]} 75 Z`;
        
        const labels = ['一', '二', '三', '四', '五', '六', '日'];

        // 呼吸发光双重节点圆圈
        let circles = '';
        xCoords.forEach((x, i) => {
          circles += `
            <g class="chart-node" style="cursor: pointer;">
              <circle cx="${x}" cy="${yCoords[i]}" r="4.5" fill="var(--primary)" opacity="0.25"></circle>
              <circle cx="${x}" cy="${yCoords[i]}" r="2" fill="var(--primary)" stroke="#fff" stroke-width="1"></circle>
              <title>周${labels[i]} 操作: ${displayCounts[i]}次</title>
            </g>
          `;
        });
        
        let textLabels = '';
        xCoords.forEach((x, i) => {
          textLabels += `<text x="${x}" y="92" fill="var(--text-muted)" font-size="8.5" font-weight="700" text-anchor="middle">${labels[i]}</text>`;
        });

        // 绘制 3 条水平虚线作为 Y 轴辅助网格线
        const gridLines = `
          <line x1="15" y1="20" x2="225" y2="20" stroke="var(--border)" stroke-dasharray="2,2" opacity="0.3" stroke-width="0.8"></line>
          <line x1="15" y1="47.5" x2="225" y2="47.5" stroke="var(--border)" stroke-dasharray="2,2" opacity="0.3" stroke-width="0.8"></line>
          <line x1="15" y1="75" x2="225" y2="75" stroke="var(--border)" stroke-dasharray="2,2" opacity="0.3" stroke-width="0.8"></line>
        `;

        chartEl.innerHTML = `
          <svg viewBox="0 0 240 100" style="width:100%; height:100%;">
            <defs>
              <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${gridLines}
            <path d="${areaPath}" fill="url(#chartAreaGrad)"></path>
            <path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(59,130,246,0.25))"></path>
            ${textLabels}
            ${circles}
          </svg>
        `;
      }
    }

    // ===== 极客时空与今日运势（初次加载） =====
    initGeekFortuneOnce();

  } catch (e) {
    // 静默失败
  }
}

// 极客运势库数据
const GEEK_FORTUNES = {
  yi: [
    "写单元测试", "Review 别人的代码", "重构祖传屎山", "在 README 里写注释", 
    "清理无用分支", "给同事代码点赞", "提前下班", "按时摸鱼", 
    "解决遗留两年的 TODO", "顺畅地跑通整个流水线", "修复生产环境 Bug", "按时提交工时"
  ],
  ji: [
    "相信“只改一行”", "盲目复制 SO 答案", "下午五点后部署发布", "在主分支直接 Force Push", 
    "不看编译日志直接提交", "写完代码不自测", "把密钥硬编码提交到 Git", "修改基础通用库",
    "不写注释", "相信前端开发说的一小时后完工", "跟测试争吵", "在没有监控的情况下修改配置"
  ],
  motto: [
    "运势平稳，多写注释可逢凶化吉。",
    "灵感源源不断，今日适合编写核心业务逻辑。",
    "思维清晰，遇到 Bug 调试一枪穿心，不必担忧。",
    "今日宜摸鱼，不要跟需求强行死磕，退一步海阔天空。",
    "今日代码灵性十足，有望跑通最难模块。",
    "运势上升，可能发现隐藏在代码深处的多年暗坑并完美修复。"
  ],
  health: [
    "健康守护：今日大脑处于高速运转模型，建议小憩片刻补充创造能量。",
    "健康守护：颈椎酸痛预警，每敲 45 分钟代码请起立活动 5 分钟。",
    "健康守护：今日灵感指数爆棚，但也不要忘了多喝水润嗓哦。",
    "健康守护：腰部受压严重，推荐把椅子高度调到大腿水平线。",
    "健康守护：眼睛略显疲劳，极客也需要偶尔眺望远方或合眼休息。"
  ]
};

let _hasInitGeekFortune = false;

function initGeekFortuneOnce() {
  if (_hasInitGeekFortune) {
    // 仅更新日期
    updateGeekFortuneDate();
    return;
  }
  _hasInitGeekFortune = true;
  refreshGeekFortune(true);
}

function updateGeekFortuneDate() {
  const dateEl = document.getElementById('geekDateText');
  if (!dateEl) return;
  const now = new Date();
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  dateEl.textContent = `${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

// 刷新运势方法
function refreshGeekFortune(isQuiet = false) {
  updateGeekFortuneDate();

  // 1. 宜、忌随机抓取 2 个
  const selectRandom = (arr, count) => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };
  
  const yis = selectRandom(GEEK_FORTUNES.yi, 2);
  const jis = selectRandom(GEEK_FORTUNES.ji, 2);
  const motto = selectRandom(GEEK_FORTUNES.motto, 1)[0];
  const health = selectRandom(GEEK_FORTUNES.health, 1)[0];
  const inspire = Math.floor(Math.random() * (100 - 80 + 1)) + 80; // 80% - 100%

  // 渲染
  const yiEl = document.getElementById('geekYiContent');
  const jiEl = document.getElementById('geekJiContent');
  const yiEl2 = document.getElementById('geekYiContent2');
  const jiEl2 = document.getElementById('geekJiContent2');
  const mottoEl = document.getElementById('geekMotto');
  const healthEl = document.getElementById('geekHealth');
  const rateEl = document.getElementById('geekInspireRate');
  const fillEl = document.getElementById('geekInspireFill');
  const hashEl = document.getElementById('geekHashVal');

  if (yiEl) yiEl.textContent = yis[0];
  if (jiEl) jiEl.textContent = jis[0];
  if (yiEl2) yiEl2.textContent = yis[1];
  if (jiEl2) jiEl2.textContent = jis[1];
  if (mottoEl) mottoEl.textContent = motto;
  if (healthEl) healthEl.textContent = health;
  if (rateEl) rateEl.textContent = inspire + '%';
  if (fillEl) fillEl.style.width = inspire + '%';

  // 渲染哈希标识 (生成一组随机 SHA256 样式)
  if (hashEl) {
    const chars = '0123456789abcdef';
    let hash = 'SHA256:';
    for (let i = 0; i < 8; i++) {
      hash += chars[Math.floor(Math.random() * 16)];
    }
    hashEl.textContent = hash;
  }

  // 最佳时段渲染
  renderGeekTimeline();

  if (!isQuiet) {
    showToast('🔮 运势已刷新！');
  }
}

// 24小时编译活跃度轴渲染
function renderGeekTimeline() {
  const timeline = document.getElementById('codingTimeline');
  const hours1El = document.getElementById('geekBestHours');
  const hours2El = document.getElementById('geekBestHours2');
  if (!timeline) return;

  // 随机推荐两组高峰时间
  const start1 = Math.floor(Math.random() * (12 - 9 + 1)) + 9;  // 9 - 12
  const end1 = start1 + 2;
  const start2 = Math.floor(Math.random() * (17 - 14 + 1)) + 14; // 14 - 17
  const end2 = start2 + 2;

  if (hours1El) hours1El.textContent = `${String(start1).padStart(2,'0')}:00~${String(end1).padStart(2,'0')}:00`;
  if (hours2El) hours2El.textContent = `${String(start2).padStart(2,'0')}:00~${String(end2).padStart(2,'0')}:00`;

  let blocks = '';
  for (let h = 0; h < 24; h++) {
    const isActive = (h >= start1 && h < end1) || (h >= start2 && h < end2);
    const activeCls = isActive ? ' active' : '';
    blocks += `<div class="timeline-hour-block${activeCls}" title="${String(h).padStart(2,'0')}:00"></div>`;
  }
  timeline.innerHTML = blocks;
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

// ==========================================
// 首页右侧新增组件：系统状态监控
// ==========================================
let _hasInitSystemMonitor = false;
let _sysMonitorInterval = null;

function initSystemMonitorOnce() {
  if (_hasInitSystemMonitor) return;
  _hasInitSystemMonitor = true;

  // 初始渲染一次
  updateSystemMonitorValues();

  // 每 3 秒刷新一次
  _sysMonitorInterval = setInterval(updateSystemMonitorValues, 3000);
}

function updateSystemMonitorValues() {
  const homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  const cpuCircle = document.getElementById('sysCpuCircle');
  const cpuVal = document.getElementById('sysCpuVal');
  const memCircle = document.getElementById('sysMemCircle');
  const memVal = document.getElementById('sysMemVal');
  const diskCircle = document.getElementById('sysDiskCircle');
  const diskVal = document.getElementById('sysDiskVal');

  // CPU 占用 12% - 35% 随机浮动
  const cpu = Math.floor(Math.random() * (35 - 12 + 1)) + 12;
  // 内存占用 58% - 68% 随机浮动
  const mem = Math.floor(Math.random() * (68 - 58 + 1)) + 58;
  // 磁盘占用固定在 45% 不变
  const disk = 45;

  if (cpuCircle && cpuVal) {
    cpuCircle.style.setProperty('--percent', `${cpu}%`);
    cpuVal.textContent = `${cpu}%`;
  }
  if (memCircle && memVal) {
    memCircle.style.setProperty('--percent', `${mem}%`);
    memVal.textContent = `${mem}%`;
  }
  if (diskCircle && diskVal) {
    diskCircle.style.setProperty('--percent', `${disk}%`);
    diskVal.textContent = `${disk}%`;
  }
}

// ==========================================
// 首页右侧新增组件：番茄专注时钟
// ==========================================
let _hasInitPomodoro = false;
let pomoSecondsRemaining = 25 * 60; // 默认 25 分钟
let pomoTimerId = null;
let pomoTimerState = 'ready'; // 'ready', 'focusing', 'paused', 'rest'

function initPomodoroOnce() {
  if (_hasInitPomodoro) return;
  _hasInitPomodoro = true;
  updatePomodoroDisplay();
}

function updatePomodoroDisplay() {
  const display = document.getElementById('pomoDisplay');
  const status = document.getElementById('pomoStatus');
  const playBtn = document.getElementById('pomoPlayBtn');
  
  if (!display || !status) return;

  const mins = Math.floor(pomoSecondsRemaining / 60);
  const secs = pomoSecondsRemaining % 60;
  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (pomoTimerState === 'ready') {
    status.textContent = 'Ready';
    status.className = 'pomo-status';
    if (playBtn) playBtn.textContent = '▶';
  } else if (pomoTimerState === 'focusing') {
    status.textContent = 'Focusing';
    status.className = 'pomo-status focusing';
    if (playBtn) playBtn.textContent = '⏸';
  } else if (pomoTimerState === 'paused') {
    status.textContent = 'Paused';
    status.className = 'pomo-status';
    if (playBtn) playBtn.textContent = '▶';
  } else if (pomoTimerState === 'rest') {
    status.textContent = 'Rest';
    status.className = 'pomo-status rest';
    if (playBtn) playBtn.textContent = '⏸';
  }
}

function togglePomodoro() {
  if (pomoTimerState === 'ready' || pomoTimerState === 'paused') {
    startPomodoro();
  } else if (pomoTimerState === 'focusing' || pomoTimerState === 'rest') {
    pausePomodoro();
  }
}

function startPomodoro() {
  if (pomoTimerId) clearInterval(pomoTimerId);
  
  if (pomoTimerState === 'ready') {
    pomoSecondsRemaining = 25 * 60;
    pomoTimerState = 'focusing';
  } else if (pomoTimerState === 'paused') {
    pomoTimerState = 'focusing';
  }
  
  updatePomodoroDisplay();

  pomoTimerId = setInterval(() => {
    if (pomoSecondsRemaining > 0) {
      pomoSecondsRemaining--;
      updatePomodoroDisplay();
    } else {
      clearInterval(pomoTimerId);
      pomoTimerId = null;
      
      if (pomoTimerState === 'focusing') {
        showToast('⏱️ 恭喜！一个番茄钟专注已完成。建议休息 5 分钟！');
        if (window.__TAURI__) {
          try {
            window.__TAURI__.notification.sendNotification({
              title: '⏱️ 番茄专注完成',
              body: '辛苦了！完成了一个番茄钟，去活动一下吧！'
            });
          } catch (e) {
            console.warn(e);
          }
        }
        pomoTimerState = 'rest';
        pomoSecondsRemaining = 5 * 60;
        startPomodoro();
      } else {
        showToast('⏱️ 休息结束！新的一天，开启下一个番茄专注吧。');
        pomoTimerState = 'ready';
        pomoSecondsRemaining = 25 * 60;
        updatePomodoroDisplay();
      }
    }
  }, 1000);
}

function pausePomodoro() {
  if (pomoTimerId) {
    clearInterval(pomoTimerId);
    pomoTimerId = null;
  }
  pomoTimerState = 'paused';
  updatePomodoroDisplay();
}

function resetPomodoro() {
  if (pomoTimerId) {
    clearInterval(pomoTimerId);
    pomoTimerId = null;
  }
  pomoTimerState = 'ready';
  pomoSecondsRemaining = 25 * 60;
  updatePomodoroDisplay();
  showToast('⏱️ 番茄钟已重置');
}
