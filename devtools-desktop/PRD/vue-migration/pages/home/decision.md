# 应用首页迁移决策

> 状态：PG3～PG5 已通过；首页 Vue 迁移阶段完成
> 关联评估：[assessment.md](./assessment.md)
> 创建日期：2026-07-21
> 确认日期：2026-07-22
> 已确认原型：`design-preview/home-reimagine-grid.html`

## 1. 页面范围

本次页面门禁覆盖应用首页的 Hero、天气/环境概览、用量统计、当前 IP 纯净检查、本周节奏、每日一言、今日活动节奏/灵感和昼夜进度卡片，以及它们依赖的 API、WebSocket 刷新、localStorage 和主题/响应式行为。

不包含：完整用量统计页、完整纯净检查页、天气服务建设、收藏列表持久化、跨页面导航重构和 Sidecar 协议变更。

## 2. 已确认的优化等级

本轮首页确定采用 **L2：布局与卡片视觉重设计**。最终亮色、暗色 HTML 原型已经由用户确认，可以进入 PG4 Vue 实现。

本次不新增天气 API、数据库表、Sidecar 协议或核心业务流程，因此不升级为 L3。等级边界如下：

| 等级 | 本轮内容 | 是否需要 HTML 原型 |
| --- | --- | --- |
| L0 | 保持当前卡片内容和布局；只做 Vue SFC 迁移、公共组件接入、响应式修复和 CSS 清理 | 否 |
| L1（推荐） | 保留当前布局与视觉方向；删除无数据来源的静态伪指标，补齐 Loading/Empty/Error、真实数据边界、可访问跳转、字号/动效和 Token 收敛 | 否 |
| L2（已确认） | 在 L1 基础上重新设计首页布局或卡片交互 | 是，最终原型已确认 |
| L3 | 在 L2 基础上增加新数据流程、API、持久化或核心功能 | 是，且需独立功能评审和提交 |

## 3. 已冻结的 L2 实施范围

### 保留

- 四排十卡片的沉浸式网格布局，以及已经确认的明暗主题、卡片表面、间距和响应式方向。
- 顶部每日一言与开发者署名 `Ledy`；每日一言只允许用户手动切换。
- 此刻/天气概览、用量统计、当前 IP 纯净检查、今日活动节奏、昼夜进度、年度进度、本周足迹、今日色谱和月相。
- 用量统计和当前 IP 纯净检查保留跳转完整页面的交互。
- 此刻使用平滑温度曲线；纯净检查使用风险刻度；昼夜进度使用时间轴；月相使用月周期曲线，避免重复圆环表达。
- 跟随系统/亮色/暗色三态主题、默认 1665×1184 铺满策略和 900×600 可滚动策略。

### 本轮优化/删除

- 删除没有数据来源的 `FOCUS 4h 20m`、`整理 12 次`、`LAST OPEN 09:41` 及其他伪指标。
- 删除每日一言中静态记录数，只保留真实的切换与收藏状态。
- 用量趋势优先使用可获得的真实分时数据；现有 API 无法提供分桶时，明确作为装饰趋势，不输出伪造刻度或结论。
- 所有异步摘要接入统一 Loading/Empty/Error 状态和重试动作。
- 用量、纯净检查卡提供明确的查看详情语义；卡片点击仍兼容旧导航桥。
- 将正文辅助文字提升到可读字号，统一使用项目 Semantic/Component Token。
- 动效保留低频、低幅度版本，并支持 `prefers-reduced-motion`。

### 数据真实性边界

- 用量统计、IP 纯净检查、今日活动节奏和本周足迹使用现有真实 API 数据。
- 当前时间、年度进度和月相由本地时间计算；昼夜进度沿用工作区默认日出/日落配置并在代码中明确来源。
- 天气数据在本轮仍是静态环境概览，代码层必须标记为 mock，不得宣称来自实时天气服务。
- 今日色谱是由时间与活动节奏生成的情绪化展示，不作为业务统计指标。

### 本轮明确不做

- 不新增天气 API、地理定位或外部天气服务。
- 不实现完整每日一言收藏列表或新的数据库表。
- 不改造用量统计和纯净检查详情页。
- 不改动 Sidecar、SQLite、2FA 安全语义或运行任务生命周期。

## 4. 目标实现结构（PG3 通过后）

```text
frontend/src/views/home/HomeView.vue
frontend/src/views/home/components/HomeHeroCard.vue
frontend/src/views/home/components/TodayOverviewCard.vue
frontend/src/views/home/components/UsageSummaryCard.vue
frontend/src/views/home/components/IpPurityCard.vue
frontend/src/views/home/components/DailyQuoteCard.vue
frontend/src/views/home/components/ActivityRhythmCard.vue
frontend/src/views/home/components/DaylightCard.vue
frontend/src/views/home/components/YearProgressCard.vue
frontend/src/views/home/components/WeeklyFootprintCard.vue
frontend/src/views/home/components/AmbientPaletteCard.vue
frontend/src/views/home/components/MoonPhaseCard.vue
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
- 跟随系统、固定亮色、固定暗色及 `prefers-reduced-motion` 均通过截图/行为检查；系统模式会响应 macOS 外观变化并记忆用户选择。
- `typecheck`、JS/CSS/Token lint、unit test、frontend build 通过。

## 6. Page Gate 状态

- PG3：**已通过**，用户确认 L2 最终 HTML 原型与实施范围。
- PG4：**已通过**，正式 Vue SFC、service、composable、组件测试和 legacy bridge 已实现。
- PG5：**已通过**，浏览器验收、旧首页运行时代码清理及用户 Tauri 手动 E2E 均已完成。
- 优化等级：**L2**。
- 自动验证：`typecheck`、JS/CSS/Token lint、8 个单测文件共 21 项测试、frontend build 和主题 E2E 全部通过。
- 浏览器验证：1665×1184 亮/暗主题无滚动、裁切、重叠或异常留白；跟随系统/亮色/暗色选择、系统主题响应和选择持久化通过；900×600 无横向溢出，主题菜单不越界，主内容与侧栏可纵向滚动；用量/纯净详情跳转、每日一言、错误重试和 14 页切换通过。
- Tauri 验收：用户已确认正式软件内主题模式、首页、页面切换和窗口缩放均无问题。
- 下一步：完成本地提交后进入 Phase 4；先对纯净检测页面执行 PG0～PG3 研究与优化确认，再开始 Vue 实现。

## 7. 变更记录

| 日期 | 变更 | 状态 |
| --- | --- | --- |
| 2026-07-21 | 创建首页 PG0～PG2 评估和 PG3 决策草案 | 待用户确认 |
| 2026-07-22 | 用户确认 L2 最终 HTML 原型与实施范围 | PG3 通过 |
| 2026-07-22 | 完成正式 Vue SFC、真实摘要数据、旧首页清理和浏览器 QA | PG4 通过；PG5 待 Tauri 手动 E2E |
| 2026-07-22 | 增加跟随系统/亮色/暗色三态主题菜单、系统变化监听与持久化测试 | PG5 自动验收通过；待 Tauri 手动 E2E |
| 2026-07-22 | 用户完成正式 Tauri 软件手动 E2E，清理过程原型与临时 QA 产物 | PG5 通过；Phase 3 首页完成 |
