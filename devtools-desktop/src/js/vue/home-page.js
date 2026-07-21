/* Vue 首页组件：仅负责首页视图、状态和交互，页面切换仍由现有 app.js 统一管理。 */
(function createDevToolsHomeVue(global) {
  const Vue = global.Vue;
  if (!Vue) throw new Error('[Vue Home] Vue runtime 未加载');

  const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount } = Vue;
  const QUOTE_KEY = 'devtools-home-quote-index';
  const SAVED_QUOTE_KEY = 'devtools-home-saved-quote';
  const QUOTES = [
    '把复杂留给系统，把简单留给自己。',
    '先让事情变得清晰，再让它变得漂亮。',
    '好的工具，应该让注意力回到正在发生的事。',
    '慢一点，通常能更快地抵达真正重要的地方。',
  ];
  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  function formatTokens(value) {
    const number = Number(value) || 0;
    if (number >= 1e8) return `${(number / 1e8).toFixed(2)} 亿`;
    if (number >= 1e4) return `${(number / 1e4).toFixed(1)} 万`;
    return number.toLocaleString('en-US');
  }

  function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function startOfWeek(date) {
    const value = startOfDay(date);
    const day = value.getDay();
    value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
    return value;
  }

  const template = `
    <div class="vue-home">
      <div class="vh-grid">
        <section class="vh-card vh-hero">
          <div class="vh-hero-copy">
            <span class="vh-overline">PERSONAL WORKSPACE · OVERVIEW</span>
            <h2>{{ greeting }}，<span class="vh-name">ldy</span></h2>
            <div class="vh-hero-quote">「把注意力留给正在发生的事。」</div>
          </div>
          <div class="vh-hero-ambient" aria-hidden="true"><span class="vh-ambient-orbit vh-ambient-orbit-a"></span><span class="vh-ambient-orbit vh-ambient-orbit-b"></span><span class="vh-ambient-core"></span><i class="vh-ambient-node vh-ambient-node-a"></i><i class="vh-ambient-node vh-ambient-node-b"></i><i class="vh-ambient-node vh-ambient-node-c"></i></div>
          <div class="vh-hero-pulse" aria-label="今日工作状态"><span><b>FOCUS</b>4h 20m</span><span><b>整理</b>12 次</span><span><b>LAST OPEN</b>09:41</span></div>
          <div class="vh-hero-side">
            <div class="vh-time-card"><span>LOCAL TIME</span><strong>{{ clockLabel }}</strong><small>{{ clockMeta }}</small></div>
            <div class="vh-stat"><span>今日状态</span><strong class="good">平稳</strong></div>
            <div class="vh-stat"><span>当前空间</span><strong>personalTools</strong></div>
          </div>
        </section>

        <section class="vh-card vh-context vh-weather">
          <div class="vh-card-head"><div><span class="vh-overline">TODAY · WUHAN</span><h2>天气</h2></div><span class="vh-hint">实时</span></div>
          <div class="vh-temp-row"><strong>31</strong><span>°C</span></div>
          <div class="vh-weather-desc">多云 · 湿度 68%</div><div class="vh-weather-meta">体感 34°C</div><div class="vh-weather-stats"><div><span>湿度</span><strong>68%</strong></div><div><span>风速</span><strong>2.1 m/s</strong></div><div><span>日落</span><strong>18:06</strong></div></div><span class="vh-sun" aria-hidden="true"></span><span class="vh-weather-visual" aria-hidden="true"><i></i><b></b><em></em></span>
        </section>

        <section class="vh-card vh-context vh-usage" role="button" tabindex="0" @click="go('usage')" @keydown.enter="go('usage')" @keydown.space.prevent="go('usage')">
          <div class="vh-card-head"><div><span class="vh-overline">USAGE</span><h2>用量统计</h2></div><span class="vh-hint">今日</span></div>
          <div class="vh-usage-main"><strong>{{ usage.tokens }}</strong><span>Tokens</span></div>
          <div class="vh-usage-sub">{{ usage.delta }}</div>
          <div class="vh-usage-insights"><div><span>成本</span><strong>{{ usage.cost }}</strong></div><div><span>缓存命中</span><strong>{{ usage.cacheHit }}</strong></div><div><span>请求</span><strong>{{ usage.requests }}</strong></div></div>
          <div class="vh-bars" aria-hidden="true"><i v-for="(height, index) in usageBars" :key="index" :style="{height: height + '%'}"></i></div>
        </section>

        <section class="vh-card vh-context vh-purity" role="button" tabindex="0" @click="go('ipcheck')" @keydown.enter="go('ipcheck')" @keydown.space.prevent="go('ipcheck')">
          <div class="vh-card-head"><div><span class="vh-overline">CURRENT IP CHECK</span><h2>纯净检查</h2></div><span class="vh-hint">{{ purity.updated }}</span></div>
          <div class="vh-purity-body"><div><small>当前 IP</small><strong>{{ purity.ip }}</strong><div class="vh-purity-meta"><span>{{ purity.location }}</span><span>{{ purity.latency }}</span></div></div><div class="vh-purity-gauge" :style="{ '--risk-angle': purityRiskAngle + 'deg' }" :aria-label="'风险值 ' + purity.risk"><strong>{{ purity.risk }}</strong></div></div>
          <div class="vh-badges"><span v-for="(badge, index) in purity.badges" :key="badge" :class="{muted: index === 2}">{{ badge }}</span></div>
        </section>

        <section class="vh-card vh-rhythm">
          <div class="vh-card-head"><div><span class="vh-overline">THE WEEK IN MOTION</span><h2>本周节奏</h2></div><span class="vh-hint">{{ weekRange }}</span></div>
          <div class="vh-rhythm-body"><div><h3>把重要的事，留在有能量的时候。</h3><div class="vh-days"><span v-for="(label, index) in weekLabels" :key="label" :class="{active: index === currentWeekday}"><i></i>{{ label }}</span></div><div class="vh-week-stats"><div><span>活跃日</span><strong>{{ weekActiveDays }} 天</strong></div><div><span>峰值</span><strong>{{ weekPeakLabel }}</strong></div><div><span>平均活动</span><strong>{{ weekAverage }}</strong></div></div></div><div><div class="vh-chart"><i v-for="(count, index) in weekCounts" :key="index" :class="{dim: !count}" :style="{height: chartHeight(count) + 'px'}"></i></div><div class="vh-chart-labels"><span v-for="label in weekLabels" :key="label">{{ label }}</span></div></div></div>
        </section>

        <section class="vh-card vh-note">
          <div class="vh-card-head"><div><span class="vh-overline">DAILY NOTE</span><h2>每日一言</h2></div><button type="button" @click="nextQuote">换一条</button></div>
          <p class="vh-quote" :class="{switching: quoteSwitching}" aria-live="polite">{{ quote }}</p><button type="button" class="vh-save" @click="saveQuote">{{ quoteSaved ? '已收藏' : '收藏' }}</button><div class="vh-note-footer"><span>今日记录<strong>3 条</strong></span><span>收藏夹<strong>12 条</strong></span></div><div class="vh-note-constellation" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        </section>

        <section class="vh-card vh-mood"><div class="vh-mood-inner"><div class="vh-card-head"><div><span class="vh-overline">DESIGN MOOD</span><h2>今日灵感</h2></div><span class="vh-hint">{{ activityHint }}</span></div><div class="vh-mood-main"><div><div class="vh-mood-title">让秩序留一点呼吸。</div><div class="vh-chips"><span>午夜蓝</span><span>微光紫</span><span>柔和金</span></div></div><div class="vh-orbit" aria-hidden="true"><i></i><b></b></div></div><div class="vh-mood-spectrum" role="img" :aria-label="activitySpectrumLabel" :class="{empty: !todayActivityCount}"><i v-for="(height, index) in activitySpectrum" :key="index" :style="{height: height + '%'}"></i></div></div></section>

        <section class="vh-card vh-daylight"><div class="vh-card-head"><div><span class="vh-overline">DAYLIGHT CYCLE</span><h2>昼夜进度</h2></div><span class="vh-hint">今日</span></div><div class="vh-daylight-main"><div class="vh-daylight-arc" :style="{ '--daylight-angle': daylightPercent * 3.6 + 'deg' }" :aria-label="'白昼进度 ' + daylightPercent + '%'"><strong>{{ daylightPercent }}%</strong></div><div class="vh-daylight-copy"><strong>{{ daylightStatus }}</strong><span>{{ daylightRemaining }}</span></div></div><div class="vh-daylight-times"><span>日出<strong>05:28</strong></span><span>日落<strong>18:06</strong></span></div></section>
      </div>

    </div>
  `;

  function createHomeComponent() {
    return {
      template,
      setup() {
        const now = ref(new Date());
        const history = ref([]);
        const runHistory = ref([]);
        const quoteIndex = ref(Number(localStorage.getItem(QUOTE_KEY)) || 0);
        const quoteSwitching = ref(false);
        const quoteSaved = ref(Boolean(localStorage.getItem(SAVED_QUOTE_KEY)));
        const usage = reactive({ tokens: '—', delta: '读取今日数据…', cost: '—', cacheHit: '—', requests: '—' });
        const purity = reactive({ ip: '检测中…', risk: '—', badges: ['正在检测'], updated: '刚刚', location: '检测中…', latency: '—' });

        const greeting = computed(() => {
          const hour = now.value.getHours();
          return hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
        });
        const clockLabel = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
        const clockMeta = computed(() => `武汉 · UTC+8 · ${WEEKDAYS[now.value.getDay()]}`);
        const quote = computed(() => QUOTES[quoteIndex.value % QUOTES.length]);
        const weekStart = computed(() => startOfWeek(now.value));
        const currentWeekday = computed(() => (now.value.getDay() + 6) % 7);
        const weekLabels = WEEK_LABELS;
        const weekRange = computed(() => {
          const start = weekStart.value;
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          return `${start.getMonth() + 1}/${start.getDate()} — ${end.getMonth() + 1}/${end.getDate()}`;
        });
        const weekCounts = computed(() => {
          const counts = Array.from({ length: 7 }, () => 0);
          history.value.forEach(item => {
            const timestamp = new Date(item.timestamp).getTime();
            if (!Number.isFinite(timestamp)) return;
            const day = new Date(timestamp);
            const index = Math.floor((startOfDay(day).getTime() - weekStart.value.getTime()) / 86400000);
            if (index >= 0 && index < 7) counts[index] += 1;
          });
          return counts;
        });
        const weekActiveDays = computed(() => weekCounts.value.filter(Boolean).length);
        const weekPeakLabel = computed(() => {
          const max = Math.max(...weekCounts.value, 0);
          if (!max) return '—';
          return `周${WEEK_LABELS[weekCounts.value.indexOf(max)]}`;
        });
        const weekAverage = computed(() => {
          const total = weekCounts.value.reduce((sum, count) => sum + count, 0);
          return total ? `${(total / Math.max(weekActiveDays.value, 1)).toFixed(1)} 次` : '—';
        });
        const purityRiskAngle = computed(() => {
          const risk = Number.parseFloat(String(purity.risk).replace('%', ''));
          return Number.isFinite(risk) ? Math.max(0, Math.min(100, risk)) * 3.6 : 0;
        });
        const activityEvents = computed(() => [
          ...history.value.map(item => item?.timestamp),
          ...runHistory.value.map(item => item?.startedAt || item?.timestamp),
        ].filter(Boolean));
        const todayActivityBuckets = computed(() => {
          const buckets = [0, 0, 0, 0, 0];
          const today = startOfDay(now.value).getTime();
          activityEvents.value.forEach(value => {
            const date = new Date(value);
            if (!Number.isFinite(date.getTime()) || startOfDay(date).getTime() !== today) return;
            const hour = date.getHours();
            const index = hour < 6 ? 0 : hour < 11 ? 1 : hour < 15 ? 2 : hour < 19 ? 3 : 4;
            buckets[index] += 1;
          });
          return buckets;
        });
        const todayActivityCount = computed(() => todayActivityBuckets.value.reduce((sum, count) => sum + count, 0));
        const activitySpectrum = computed(() => {
          const max = Math.max(...todayActivityBuckets.value, 1);
          return todayActivityBuckets.value.map(count => count ? Math.max(18, Math.round(count / max * 100)) : 5);
        });
        const activityHint = computed(() => todayActivityCount.value ? `今日活动 ${todayActivityCount.value} 次` : '今日暂无活动');
        const activitySpectrumLabel = computed(() => `今日活动节奏：${todayActivityBuckets.value.join('、')} 次`);
        const daylightPercent = computed(() => {
          const minutes = now.value.getHours() * 60 + now.value.getMinutes();
          const sunrise = 5 * 60 + 28;
          const sunset = 18 * 60 + 6;
          return Math.max(0, Math.min(100, Math.round((minutes - sunrise) / (sunset - sunrise) * 100)));
        });
        const daylightStatus = computed(() => {
          const minutes = now.value.getHours() * 60 + now.value.getMinutes();
          return minutes >= 5 * 60 + 28 && minutes <= 18 * 60 + 6 ? '白昼进行中' : '夜间休息';
        });
        const daylightRemaining = computed(() => {
          const minutes = now.value.getHours() * 60 + now.value.getMinutes();
          const target = minutes >= 5 * 60 + 28 && minutes <= 18 * 60 + 6 ? 18 * 60 + 6 : 5 * 60 + 28;
          let diff = target - minutes;
          if (diff < 0) diff += 24 * 60;
          const hours = Math.floor(diff / 60);
          const mins = diff % 60;
          return minutes >= 5 * 60 + 28 && minutes <= 18 * 60 + 6 ? `距离日落还有 ${hours} 小时 ${mins} 分` : `距离日出还有 ${hours} 小时 ${mins} 分`;
        });
        const usageBars = [32, 48, 40, 72, 55, 82, 64, 75, 45, 69];

        function chartHeight(count) {
          const max = Math.max(...weekCounts.value, 1);
          return count ? Math.max(15, Math.round(count / max * 92)) : 12;
        }

        async function refresh() {
          if (typeof API === 'undefined') return;
          const dayStart = startOfDay(now.value).getTime();
          const start = Math.floor(dayStart / 1000);
          const end = Math.floor((dayStart + 86400000) / 1000);
          const results = await Promise.allSettled([
            API.get('/api/history'),
            API.get('/api/run/history'),
            API.get(`/api/usage/summary?start=${start}&end=${end}`),
            API.get(`/api/usage/summary?start=${start - 86400}&end=${start}`).catch(() => null),
            API.get('/api/ipcheck/lookup', 20000),
          ]);
          const [historyResult, runHistoryResult, usageResult, previousResult, purityResult] = results;
          if (historyResult.status === 'fulfilled') history.value = Array.isArray(historyResult.value) ? historyResult.value : [];
          if (runHistoryResult.status === 'fulfilled') runHistory.value = Array.isArray(runHistoryResult.value) ? runHistoryResult.value : [];
          if (usageResult.status === 'fulfilled') {
            const summary = usageResult.value || {};
            usage.tokens = formatTokens(summary.totalTokens);
            usage.cost = Number.isFinite(Number(summary.costUsd)) ? `$${Number(summary.costUsd).toFixed(2)}` : '—';
            usage.cacheHit = Number.isFinite(Number(summary.cacheHitRate)) ? `${(Number(summary.cacheHitRate) * 100).toFixed(1)}%` : '—';
            usage.requests = Number(summary.requests || 0).toLocaleString('en-US');
            const previous = previousResult.status === 'fulfilled' ? previousResult.value : null;
            const previousTokens = Number(previous?.totalTokens) || 0;
            const currentTokens = Number(summary.totalTokens) || 0;
            usage.delta = previousTokens > 0 ? `较昨日 ${currentTokens >= previousTokens ? '↑' : '↓'}${Math.abs((currentTokens - previousTokens) / previousTokens * 100).toFixed(1)}%` : '今日实时';
          } else {
            usage.delta = '用量数据暂不可用';
          }
          if (purityResult.status === 'fulfilled') {
            const data = purityResult.value || {};
            purity.ip = data.ip || '—';
            purity.risk = data.risk_score || '—';
            purity.badges = [data.risk_label, data.native_ip, data.ip_type].filter(Boolean);
            if (!purity.badges.length) purity.badges = ['暂无结果'];
            purity.location = data.location || data.org || '未知位置';
            purity.latency = data.latency ? `${data.latency} ms` : '实时';
            purity.updated = '刚刚';
          } else {
            purity.ip = '暂不可用';
            purity.badges = ['打开检测页重试'];
            purity.location = '—';
            purity.latency = '—';
          }
        }

        function nextQuote() {
          quoteSwitching.value = true;
          window.setTimeout(() => {
            quoteIndex.value = (quoteIndex.value + 1) % QUOTES.length;
            localStorage.setItem(QUOTE_KEY, String(quoteIndex.value));
            quoteSaved.value = false;
            quoteSwitching.value = false;
          }, 220);
        }

        function saveQuote() {
          localStorage.setItem(SAVED_QUOTE_KEY, quote.value);
          quoteSaved.value = true;
        }

        function go(page) {
          if (typeof global.switchPage === 'function') {
            global.switchPage(page);
            return;
          }
          // 旧版 app.js 中的 switchPage 可能存在于脚本全局词法环境，
          // 但不一定挂在 window 上；回退到现有导航按钮可保持两套架构共用入口。
          const nav = document.querySelector(`.sidebar-item[data-page="${page}"]`);
          if (nav) nav.click();
        }

        function notifyRuntimeChange() {
          // 部署/本地运行完成后由旧事件总线触发，重新读取活动数据。
          refresh().catch(error => console.warn('[Vue Home] 活动数据刷新失败:', error));
        }

        let clockTimer;
        onMounted(() => {
          clockTimer = window.setInterval(() => { now.value = new Date(); }, 1000);
          refresh().catch(error => console.warn('[Vue Home] 首页数据加载失败:', error));
        });
        onBeforeUnmount(() => window.clearInterval(clockTimer));

        return { greeting, clockLabel, clockMeta, usage, purity, purityRiskAngle, weekLabels, currentWeekday, weekRange, weekCounts, weekActiveDays, weekPeakLabel, weekAverage, chartHeight, usageBars, quote, quoteSwitching, quoteSaved, nextQuote, saveQuote, go, refresh, notifyRuntimeChange, activityHint, activitySpectrum, activitySpectrumLabel, todayActivityCount, daylightPercent, daylightStatus, daylightRemaining };
      },
    };
  }

  let mountedApp = null;
  let mountedComponent = null;
  global.DevToolsHomeApp = {
    mount(root) {
      if (!root) return null;
      if (!mountedApp) {
        mountedComponent = createHomeComponent();
        mountedApp = createApp(mountedComponent).mount(root);
      }
      return mountedApp;
    },
    async refresh() {
      if (mountedApp?.$?.setupState?.refresh) return mountedApp.$.setupState.refresh();
      return undefined;
    },
    notifyRuntimeChange() {
      mountedApp?.$?.setupState?.notifyRuntimeChange?.();
    },
  };
})(window);
