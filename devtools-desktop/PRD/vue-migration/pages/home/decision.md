# 应用首页迁移决策

> 状态：等待用户确认（PG3 未通过）
> 关联评估：[assessment.md](./assessment.md)
> 创建日期：2026-07-21

## 1. 页面范围

本次页面门禁覆盖应用首页的 Hero、天气/环境概览、用量统计、当前 IP 纯净检查、本周节奏、每日一言、今日活动节奏/灵感和昼夜进度卡片，以及它们依赖的 API、WebSocket 刷新、localStorage 和主题/响应式行为。

不包含：完整用量统计页、完整纯净检查页、天气服务建设、收藏列表持久化、跨页面导航重构和 Sidecar 协议变更。

## 2. 待用户选择的优化等级

请在以下等级中确认一个作为本轮首页的 PG3 范围：

| 等级 | 本轮内容 | 是否需要 HTML 原型 |
| --- | --- | --- |
| L0 | 保持当前卡片内容和布局；只做 Vue SFC 迁移、公共组件接入、响应式修复和 CSS 清理 | 否 |
| L1（推荐） | 保留当前布局与视觉方向；删除无数据来源的静态伪指标，补齐 Loading/Empty/Error、真实数据边界、可访问跳转、字号/动效和 Token 收敛 | 否 |
| L2 | 在 L1 基础上重新设计首页布局或卡片交互 | 是，需先确认亮暗主题 prototype |
| L3 | 在 L2 基础上增加新数据流程、API、持久化或核心功能 | 是，且需独立功能评审和提交 |

## 3. 当前推荐冻结范围（仅在用户选择 L1 后生效）

### 保留

- 沉浸式 Hero、实时问候、本地时间和工作空间信息。
- 天气/环境概览卡，但明确当前数据是静态概览，不冒充实时天气。
- 用量统计和当前 IP 纯净检查摘要，并保留跳转完整页面。
- 本周节奏、今日活动节奏、昼夜进度和手动每日一言。
- 亮色/暗色主题、默认 1665×1184 铺满策略和 900×600 可滚动策略。

### 本轮优化/删除

- 删除 Hero 中没有数据来源的 `FOCUS 4h 20m`、`整理 12 次`、`LAST OPEN 09:41`。
- 删除每日一言中静态的“今日记录 3 条”和“收藏夹 12 条”，只保留真实收藏状态。
- 不把固定 `usageBars` 数组作为真实趋势图；没有分桶数据时显示简化装饰或明确的无趋势状态。
- 所有异步摘要接入统一 Loading/Empty/Error 状态和重试动作。
- 用量、纯净检查卡提供明确的查看详情语义；卡片点击仍兼容旧导航桥。
- 将正文辅助文字提升到可读字号，统一使用项目 Semantic/Component Token。
- 动效保留低频、低幅度版本，并支持 `prefers-reduced-motion`。

### 本轮明确不做

- 不新增天气 API、地理定位或外部天气服务。
- 不实现完整每日一言收藏列表或新的数据库表。
- 不改造用量统计和纯净检查详情页。
- 不改动 Sidecar、SQLite、2FA 安全语义或运行任务生命周期。

## 4. 目标实现结构（PG3 通过后）

```text
frontend/src/views/home/HomeView.vue
frontend/src/views/home/components/HomeHeroCard.vue
frontend/src/views/home/components/WeatherCard.vue
frontend/src/views/home/components/UsageSummaryCard.vue
frontend/src/views/home/components/IpPurityCard.vue
frontend/src/views/home/components/WeeklyRhythmCard.vue
frontend/src/views/home/components/DailyQuoteCard.vue
frontend/src/views/home/components/ActivityMoodCard.vue
frontend/src/views/home/components/DaylightCard.vue
frontend/src/views/home/composables/useHomeDashboard.ts
frontend/src/services/modules/home-service.ts
```

实现约束：

- View 不直接导入 Naive UI；复杂控件通过项目适配层，首页优先使用已登记的第一方 Base 组件。
- 请求、响应归一化和超时放在 `home-service.ts`；状态和派生数据放在 `useHomeDashboard.ts`。
- 首页使用 `PageFrame variant="immersive"`，不渲染普通 `PageTop`。
- 新旧实现不可长期并行；PG5 删除全局 Vue Runtime、`home.js`、`home-page.js` 和无消费者 CSS。

## 5. 验收标准（用户确认后冻结）

- 首页 DOM 由正式 SFC 生成，不依赖 `window.DevToolsHomeApp` 业务全局对象。
- 默认窗口 1665×1184：亮色、暗色均无滚动条、无裁切、无重叠和大面积异常留白。
- 900×600：亮色、暗色均无横向溢出，内容可纵向滚动且卡片不重叠。
- 用量和纯净检查摘要可进入对应完整页面。
- API 加载、空数据、失败和重试状态可识别；请求不会因切页重复创建时钟或永久定时器。
- 每日一言只在用户点击“换一条”时切换，不自动轮换。
- 亮暗主题和 `prefers-reduced-motion` 均通过截图/行为检查。
- `typecheck`、JS/CSS/Token lint、unit test、frontend build 通过。

## 6. PG3 状态

- 当前状态：**待用户确认**。
- 需要用户回复：选择 L0、L1、L2 或 L3；如选择 L2/L3，再确认是否需要先制作新版 HTML 原型。
- 在确认前：只允许维护评估文档和平台层，不开始首页 Vue 编码。

## 7. 变更记录

| 日期 | 变更 | 状态 |
| --- | --- | --- |
| 2026-07-21 | 创建首页 PG0～PG2 评估和 PG3 决策草案 | 待用户确认 |
