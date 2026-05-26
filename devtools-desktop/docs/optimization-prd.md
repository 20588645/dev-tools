# DevTools Desktop 代码优化 PRD

> 版本：v1.0  
> 日期：2026-05-26  
> 当前版本：0.1.23

---

## 一、CSS 清理

### 1.1 移除死代码

| 类型 | 内容 | 位置 |
|------|------|------|
| 废弃元素 | `.icon-dock`, `.dock-item`, `.dock-tooltip`, `.dock-divider`, `.navbar` | ~Line 882-889 |
| 废弃布局 | `.topbar`, `.topbar-left`, `.topbar-right`, `.topbar-title` | ~Line 168-210 |
| 废弃布局 | `.app-toolbar`, `.toolbar-left`, `.toolbar-right`, `.toolbar-meta`, `.app-title` | ~Line 795-862 |
| 废弃首页 | `.home-body`, `.home-left`, `.home-right` | ~Line 2072 |
| 废弃动画 | `@keyframes slideInLeft`（已被 `animation: none !important` 覆盖） | ~Line 100 |

### 1.2 合并重复定义

| 选择器 | 重复次数 | 说明 |
|--------|---------|------|
| `.app-sidebar` | 9次 | 只保留最终生效的"Final Mac Native"版本 |
| `.main-content` | 8次 | 只保留最终生效版本 |
| `.home-greeting` | 7次 | 合并为1处 |
| `.sidebar-item` | 5次 | 合并为1处 |
| `.home-stats` | 3次 | 合并为1处 |
| `.quick-action-card` | 3次 | 合并为1处 |

### 1.3 减少 !important 使用

- 当前 `!important` 使用次数：90+
- 目标：通过提高选择器优先级替代 `!important`，保留不可避免的（如 `.page { display: none !important }`）
- 优先处理：将"Final Mac Native"层直接内联为基础样式，移除被覆盖的旧层

### 1.4 执行策略

由于 CSS 改动量大（~10000行），采用**保守策略**：
1. 先移除明确死代码（1.1）
2. 暂不做大规模合并（风险高），后续逐步迁移

---

## 二、JS 错误处理

### 2.1 统一 API 错误处理函数

新增一个全局错误处理工具函数：

```javascript
function handleApiError(e, context = '') {
  const msg = context ? `${context}: ${e.message}` : e.message;
  console.error('[API Error]', msg);
  // 仅对用户触发的操作显示 toast，后台加载静默处理
}
```

### 2.2 需要补充错误处理的 API 调用

| 位置 | 函数 | 当前处理 | 改进 |
|------|------|---------|------|
| Line 865 | loadHomeData → todos | `catch(e){}` | 保持静默但 console.warn |
| Line 879 | loadHomeData → notes | `catch(e){}` | 保持静默但 console.warn |
| Line 1055 | loadRunStatuses | `catch { reset }` | 加 console.warn |
| Line 1234 | loadLastDeployInfos | `catch { ignore }` | 保持（逐项容错合理） |
| Line 3549 | initReport config | `catch(e){}` | 加 console.warn |

### 2.3 API 层增强

在 `api.js` 中：
- 添加请求超时（10秒）
- 添加网络错误友好提示
- 合并重复的 `del()` 和 `delete()` 方法

### 2.4 WebSocket 增强

- 添加指数退避重连（3s → 6s → 12s → 30s max）
- 添加最大重连次数（50次后停止）
- 添加 `onerror` 处理

---

## 三、JS 全局状态管理

### 3.1 缓存频繁访问的 DOM 元素

将 `updateHomeDateTime()` 中的 DOM 查询缓存：

```javascript
// 缓存
let _homeDateEl = null;
let _homeGreetingEl = null;

function updateHomeDateTime() {
  if (!_homeDateEl) _homeDateEl = document.getElementById('homeDate');
  if (!_homeGreetingEl) _homeGreetingEl = document.getElementById('homeGreeting');
  // 使用缓存引用
}
```

### 3.2 页面不可见时暂停定时器

`updateHomeDateTime` 的 setInterval 在页面切换到其他 tab 时仍在运行。添加可见性检查：

```javascript
function updateHomeDateTime() {
  if (document.querySelector('#page-home:not(.active)')) return; // 非首页时跳过
  // ...
}
```

### 3.3 全局变量归类

将 64 个全局变量按模块归类为对象（长期目标，本次不执行）：
- `AppState.projects`, `AppState.servers`, etc.
- `DeployState.currentId`, `DeployState.busy`, etc.
- `RunState.running`, `RunState.currentId`, etc.

**本次只做**：添加注释分组标记，确保变量声明有序。

---

## 四、性能优化

### 4.1 大列表渲染优化

`renderProjects()` 和 `renderRunPage()` 目前用 `innerHTML = items.map(...)` 一次性重建整个 DOM。对于 7 个项目问题不大，但如果项目数增多可能卡顿。

**本次改进**：
- 对 `renderProjects()` 和 `renderRunPage()` 使用 `DocumentFragment` 替代直接 innerHTML
- 仅在数据真正变化时重新渲染（简单对比）

### 4.2 搜索防抖

`searchInput` 和 `runSearchInput` 的 `oninput` 事件直接触发全量重新渲染。添加 150ms 防抖：

```javascript
let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderProjects, 150);
});
```

### 4.3 历史记录虚拟滚动（非必要，标记为后续）

部署历史如果超过 500 条，可能有滚动性能问题。当前保持现状，标记为后续优化项。

---

## 五、执行计划

| 阶段 | 内容 | 风险 | 预计改动量 |
|------|------|------|-----------|
| Phase 1 | CSS 死代码移除 | 低 | 删除~200行 |
| Phase 2 | API 层增强（超时+错误提示） | 低 | 修改 api.js ~30行 |
| Phase 3 | WebSocket 重连优化 | 低 | 修改 websocket.js ~20行 |
| Phase 4 | DOM 缓存 + 定时器优化 | 低 | 修改 app.js ~20行 |
| Phase 5 | 搜索防抖 | 低 | 修改 app.js ~10行 |
| Phase 6 | 静默 catch 补充 console.warn | 极低 | 修改 app.js ~10行 |

**总预计改动**：~300行修改/删除，不影响任何现有功能和 UI。

---

## 六、验收标准

- [ ] CSS 文件行数减少 150+ 行
- [ ] 无 `.icon-dock`、`.navbar`、`.topbar` 等废弃选择器
- [ ] API 调用超时不会无限等待
- [ ] WebSocket 断线重连有退避策略
- [ ] 首页定时器在非首页时不做 DOM 操作
- [ ] 搜索输入有防抖处理
- [ ] 所有功能不受影响（手动验证各页面）
